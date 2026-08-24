import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity,
  TextInput, BackHandler, Modal, Platform, StatusBar, FlatList, ActivityIndicator,
} from 'react-native';
import {
  ShieldCheck, AlertCircle, ChevronLeft, Search, Shield, X, ChevronRight,
  Lock, CheckCircle2, XCircle, Users, Key,
} from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { typography } from '../../theme';
import { api } from '../../services/api';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { LoadingView } from '../../components/common/LoadingView';
import { EmptyState } from '../../components/common/EmptyState';

// ─── Constants & Helpers ──────────────────────────────────────────────────────
function getUserRoleInfo(account) {
  const r = account?.role;
  const strRole = (r !== undefined && r !== null) ? String(r).toLowerCase().trim() : '';

  if (strRole === '0' || strRole === 'super_admin' || strRole === 'superadmin') {
    return { roleLabel: 'Super Admin', roleVariant: 'rose', isSuperAdmin: true };
  }
  if (strRole === '1' || strRole === 'admin') {
    return { roleLabel: 'Admin', roleVariant: 'primary', isSuperAdmin: false };
  }
  if (strRole === 'agent') {
    return { roleLabel: 'Agent', roleVariant: 'cyan', isSuperAdmin: false };
  }
  if (strRole === 'hr') {
    return { roleLabel: 'HR', roleVariant: 'violet', isSuperAdmin: false };
  }

  // Default for all regular users/employees
  return { roleLabel: 'Employee', roleVariant: 'emerald', isSuperAdmin: false };
}

// All known CRUD actions — shown as columns in the matrix
const MATRIX_ACTIONS = ['read', 'create', 'edit', 'delete'];

// ─── Helpers ─────────────────────────────────────────────────────────────────
/**
 * Parse a flat {code: {allowed, description}} permission map into a
 * resource-grouped matrix:
 *   [{ resource, actions: {read: true|false|null, create: …, …} }]
 *
 * Supports codes like:
 *   "hr.appointment.read"      → resource="hr.appointment"  action="read"
 *   "salary"                   → resource="salary"           action=*  (wildcard)
 *   "tickets.admin"            → resource="tickets"          action="admin"
 */
function buildMatrix(permissions) {
  const map = {};
  Object.entries(permissions || {}).forEach(([code, meta]) => {
    const parts = code.split('.');
    let resource, action;
    if (parts.length === 1) {
      resource = parts[0];
      action = 'all';
    } else if (MATRIX_ACTIONS.includes(parts[parts.length - 1])) {
      action = parts[parts.length - 1];
      resource = parts.slice(0, parts.length - 1).join('.');
    } else {
      resource = parts.slice(0, parts.length - 1).join('.');
      action = parts[parts.length - 1];
    }
    if (!map[resource]) map[resource] = {};
    map[resource][action] = meta?.allowed ?? false;
  });
  return Object.entries(map)
    .map(([resource, actions]) => ({ resource, actions }))
    .sort((a, b) => a.resource.localeCompare(b.resource));
}

// ─── Permission Matrix view ───────────────────────────────────────────────────
function PermissionMatrix({ rows, theme }) {
  if (!rows || rows.length === 0) {
    return (
      <EmptyState
        icon={Lock}
        title="No permission data"
        message="No permission matrix available."
      />
    );
  }

  return (
    <View style={styles.matrixWrap}>
      {/* Header row */}
      <View style={[styles.matrixHeader, { borderBottomColor: theme.border, backgroundColor: theme.surfaceElevated }]}>
        <Text style={[styles.matrixResourceLabel, { color: theme.textMuted }]}>RESOURCE</Text>
        {MATRIX_ACTIONS.map((a) => (
          <Text key={a} style={[styles.matrixActionLabel, { color: theme.textMuted }]}>{a.toUpperCase()}</Text>
        ))}
      </View>

      {/* Data rows */}
      {rows.map((row, idx) => {
        const allActions = { ...row.actions };
        // If there's an "all" wildcard, apply it to all standard actions
        const isWildcard = 'all' in allActions;
        const wildcardVal = isWildcard ? allActions['all'] : null;

        return (
          <View
            key={row.resource}
            style={[
              styles.matrixRow,
              { borderBottomColor: theme.border },
              idx % 2 === 0 ? { backgroundColor: theme.background } : { backgroundColor: theme.surfaceCard + '80' },
            ]}
          >
            <Text style={[styles.matrixResource, { color: theme.textPrimary }]} numberOfLines={2}>
              {row.resource}
            </Text>
            {MATRIX_ACTIONS.map((action) => {
              const val = isWildcard && wildcardVal !== null
                ? wildcardVal
                : allActions[action];
              if (val === undefined || val === null) {
                return (
                  <View key={action} style={styles.matrixCell}>
                    <Text style={[styles.matrixDash, { color: theme.textMuted }]}>—</Text>
                  </View>
                );
              }
              return (
                <View key={action} style={styles.matrixCell}>
                  {val ? (
                    <CheckCircle2 size={18} color={theme.emerald} />
                  ) : (
                    <XCircle size={18} color={theme.rose} />
                  )}
                </View>
              );
            })}
            {/* Show non-standard actions as extra row */}
            {Object.keys(allActions).filter(a => !MATRIX_ACTIONS.includes(a) && a !== 'all').length > 0 ? null : null}
          </View>
        );
      })}

      {/* Extra actions outside the standard 4 columns */}
      {rows.filter(r => Object.keys(r.actions).some(a => !MATRIX_ACTIONS.includes(a) && a !== 'all')).map((row) => {
        const extras = Object.entries(row.actions).filter(([a]) => !MATRIX_ACTIONS.includes(a) && a !== 'all');
        return (
          <View key={`${row.resource}-extras`} style={[styles.extraActionsRow, { borderBottomColor: theme.border, backgroundColor: theme.surfaceCard }]}>
            <Text style={[styles.matrixResource, { color: theme.textMuted, fontSize: 10 }]}>{row.resource}</Text>
            <View style={styles.extraBadges}>
              {extras.map(([action, allowed]) => (
                <View key={action} style={[styles.extraBadge, { backgroundColor: allowed ? theme.emerald + '20' : theme.rose + '20' }]}>
                  <Text style={[styles.extraBadgeText, { color: allowed ? theme.emerald : theme.rose }]}>
                    {action}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ─── Compute User-Specific Role Permissions ─────────────────────────────────
function computeUserPermissions(targetUser, basePermissions) {
  if (!basePermissions) return null;

  const { isSuperAdmin, roleLabel } = getUserRoleInfo(targetUser);

  // 1. Super Admin has full wildcard access to all system permissions
  if (isSuperAdmin) {
    const result = {};
    Object.keys(basePermissions).forEach((key) => {
      result[key] = { ...basePermissions[key], allowed: true };
    });
    return result;
  }

  // 2. Admin has administrative access
  if (roleLabel === 'Admin') {
    const result = {};
    Object.keys(basePermissions).forEach((key) => {
      const isSuperOnly = key.includes('emergency_access') || key.includes('super_admin');
      result[key] = { ...basePermissions[key], allowed: !isSuperOnly };
    });
    return result;
  }

  // 3. Employee / Regular User — Deny all administrative & HR management permissions
  const result = {};
  Object.keys(basePermissions).forEach((key) => {
    const code = key.toLowerCase();
    const isAdminOrHrPerm =
      code.startsWith('admin.') ||
      code.startsWith('hr.') ||
      code.startsWith('document.') ||
      code.startsWith('dashboard.') ||
      code.includes('create') ||
      code.includes('delete') ||
      code.includes('update') ||
      code.includes('assign') ||
      code.includes('approve') ||
      code.includes('publish') ||
      code.includes('unlock') ||
      code.includes('lock') ||
      code.includes('export') ||
      code.includes('import');

    const isEmployeeSelfService =
      code.includes('self') ||
      code.includes('mine') ||
      code === 'profile.read' ||
      code === 'salary_slip.read' ||
      code === 'ticket.read';

    result[key] = {
      ...basePermissions[key],
      allowed: isEmployeeSelfService && !isAdminOrHrPerm,
    };
  });

  return result;
}

// ─── User Detail Modal ─────────────────────────────────────────────────────────
function UserDetailModal({ user, systemPermissions, onClose, theme }) {
  const [tab, setTab] = useState('info');

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose(); return true;
    });
    return () => sub.remove();
  }, [onClose]);

  const { roleLabel, roleVariant, isSuperAdmin } = getUserRoleInfo(user);
  const initials = (user?.name || 'U').split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
  const userRolePerms = computeUserPermissions(user, systemPermissions);
  const userMatrixRows = buildMatrix(userRolePerms);

  return (
    <Modal visible animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={[styles.modalScreen, { backgroundColor: theme.background }]}>
        {/* Modal header */}
        <View style={[styles.modalHeader, {
          backgroundColor: theme.surfaceCard,
          borderBottomColor: theme.border,
          paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 8 : 44,
        }]}>
          <TouchableOpacity onPress={onClose} style={styles.modalClose}>
            <ChevronLeft size={22} color={theme.primary} />
            <Text style={[styles.modalBack, { color: theme.primary }]}>Access Control</Text>
          </TouchableOpacity>
          <Badge label="View Only" variant="outline" size="small" />
        </View>

        {/* User hero */}
        <View style={[styles.userHero, { backgroundColor: theme.surfaceCard, borderBottomColor: theme.border }]}>
          <View style={[styles.heroAvatar, { backgroundColor: isSuperAdmin ? theme.rose + '25' : theme.primary + '25' }]}>
            <Text style={[styles.heroInitials, { color: isSuperAdmin ? theme.rose : theme.primary }]}>{initials}</Text>
          </View>
          <View style={styles.heroMid}>
            <Text style={[styles.heroName, { color: theme.textPrimary }]}>{user?.name}</Text>
            <Text style={[styles.heroEmail, { color: theme.textMuted }]}>{user?.email}</Text>
          </View>
          <Badge label={roleLabel} variant={roleVariant} />
        </View>

        {/* Inner tabs */}
        <View style={[styles.innerTabBar, { backgroundColor: theme.surfaceElevated, borderBottomColor: theme.border }]}>
          {[{ key: 'info', label: 'Profile' }, { key: 'matrix', label: 'Permissions' }].map(({ key, label }) => (
            <TouchableOpacity
              key={key}
              style={[styles.innerTab, tab === key && { borderBottomColor: theme.primary, borderBottomWidth: 2 }]}
              onPress={() => setTab(key)}
            >
              <Text style={[styles.innerTabText, { color: tab === key ? theme.primary : theme.textMuted }]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView contentContainerStyle={styles.modalContent}>
          {tab === 'info' ? (
            <Card elevated style={styles.infoCard}>
              <InfoRow label="Employee Code" value={user?.emp_code || '—'} theme={theme} />
              <InfoRow label="Company Scope" value={user?.company_code || 'All Companies'} theme={theme} accent />
              <InfoRow label="Assigned Role" value={roleLabel} theme={theme} />
            </Card>
          ) : (
            <>
              <Text style={[styles.matrixTitle, { color: theme.textMuted }]}>
                Live permission matrix assigned to {roleLabel} ({user?.name})
              </Text>
              <PermissionMatrix rows={userMatrixRows} theme={theme} />
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function InfoRow({ label, value, theme, accent }) {
  return (
    <View style={[styles.infoRow, { borderBottomColor: theme.border }]}>
      <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: accent ? theme.primary : theme.textPrimary }]}>{value}</Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export function AdminAccountsScreen({ onBack }) {
  const { theme } = useTheme();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState('users');
  const [accounts, setAccounts] = useState([]);
  const [myPermissions, setMyPermissions] = useState(null);
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(25);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);

  useEffect(() => {
    const onBackPress = () => {
      if (onBack) { onBack(); return true; }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [onBack]);

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    setVisibleCount(25);
    try {
      const [accsRes, empsRes, permRes] = await Promise.all([
        api.getAdminAccounts({ limit: 500 }).catch(() => null),
        api.getAdminEmployees({ limit: 500 }).catch(() => null),
        api.getMyPermissions().catch(() => null),
      ]);

      const list = [];
      const seenEmails = new Set();

      // First add accounts from rbac/user-roles
      if (accsRes?.status && Array.isArray(accsRes.data)) {
        accsRes.data.forEach((a) => {
          if (a.email) seenEmails.add(a.email.toLowerCase());
          list.push(a);
        });
      }

      // Then add employees that were not in user-roles list
      if (empsRes?.status && Array.isArray(empsRes.data)) {
        empsRes.data.forEach((e) => {
          const email = e.email || e.official_email;
          if (email && !seenEmails.has(email.toLowerCase())) {
            seenEmails.add(email.toLowerCase());
            list.push({
              id: e.id,
              name: e.name || `${e.first_name || ''} ${e.last_name || ''}`.trim() || 'Employee',
              email: email,
              emp_code: e.emp_code || e.employee_code,
              role: e.role !== undefined ? e.role : '2',
              company_code: e.company_code || e.unit_name || 'All Companies',
            });
          }
        });
      }

      setAccounts(list);

      if (permRes?.success && permRes.data?.permissions) {
        setMyPermissions(permRes.data.permissions);
      }
    } catch (e) {
      setError(e?.message || 'Could not load data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setVisibleCount(25);
  }, [search]);

  const filteredAccounts = accounts.filter((a) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (a.name || '').toLowerCase().includes(q) ||
      (a.email || '').toLowerCase().includes(q) ||
      (a.emp_code || '').toLowerCase().includes(q)
    );
  });

  const displayedAccounts = filteredAccounts.slice(0, visibleCount);
  const hasMoreAccounts = visibleCount < filteredAccounts.length;

  const handleEndReached = () => {
    if (hasMoreAccounts) {
      setVisibleCount((prev) => prev + 25);
    }
  };

  const matrixRows = buildMatrix(myPermissions);

  const renderUserItem = ({ item: a }) => {
    const { roleLabel, roleVariant, isSuperAdmin } = getUserRoleInfo(a);
    const initials = (a.name || 'U').split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();

    return (
      <TouchableOpacity key={a.id || a.email} activeOpacity={0.75} onPress={() => setSelectedUser(a)}>
        <Card style={styles.userCard} elevated>
          <View style={styles.userCardTop}>
            <View style={[styles.avatar, { backgroundColor: isSuperAdmin ? theme.rose + '22' : theme.primary + '22' }]}>
              <Text style={[styles.avatarInitials, { color: isSuperAdmin ? theme.rose : theme.primary }]}>{initials}</Text>
            </View>

            <View style={styles.userCardInfo}>
              <Text style={[styles.userName, { color: theme.textPrimary }]} numberOfLines={1}>{a.name}</Text>
              <Text style={[styles.userEmail, { color: theme.textMuted }]} numberOfLines={1}>{a.email}</Text>
            </View>

            <Badge label={roleLabel} variant={roleVariant} size="small" />
            <ChevronRight size={16} color={theme.textMuted} style={{ marginLeft: 4 }} />
          </View>

          <View style={[styles.userCardMeta, { borderTopColor: theme.border }]}>
            {a.emp_code ? (
              <View style={styles.metaChip}>
                <Text style={[styles.metaChipKey, { color: theme.textMuted }]}>Emp Code</Text>
                <Text style={[styles.metaChipVal, { color: theme.textPrimary }]}>{a.emp_code}</Text>
              </View>
            ) : null}
            <View style={styles.metaChip}>
              <Text style={[styles.metaChipKey, { color: theme.textMuted }]}>Company Scope</Text>
              <Text style={[styles.metaChipVal, { color: theme.primary }]} numberOfLines={1}>{a.company_code || 'All Companies'}</Text>
            </View>
          </View>
        </Card>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      {/* ── Header ── */}
      <View style={styles.headerArea}>
        {onBack ? (
          <TouchableOpacity style={styles.backRow} onPress={onBack} activeOpacity={0.7}>
            <ChevronLeft size={18} color={theme.primary} />
            <Text style={[styles.backText, { color: theme.primary }]}>Back to More</Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>Access Control</Text>
          <Badge label="View Only" variant="outline" size="small" />
        </View>
        <Text style={[styles.subtitle, { color: theme.textMuted }]}>
          User accounts roster & permission matrix
        </Text>

        {/* Tabs */}
        <View style={[styles.tabBar, { backgroundColor: theme.surfaceElevated }]}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'users' && { backgroundColor: theme.primary }]}
            onPress={() => setActiveTab('users')}
          >
            <Users size={14} color={activeTab === 'users' ? '#FFF' : theme.textMuted} />
            <Text style={[styles.tabText, { color: activeTab === 'users' ? '#FFFFFF' : theme.textMuted }]}>
              Users ({accounts.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'matrix' && { backgroundColor: theme.primary }]}
            onPress={() => setActiveTab('matrix')}
          >
            <Key size={14} color={activeTab === 'matrix' ? '#FFF' : theme.textMuted} />
            <Text style={[styles.tabText, { color: activeTab === 'matrix' ? '#FFFFFF' : theme.textMuted }]}>
              Permissions
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <LoadingView label="Loading…" />
      ) : activeTab === 'users' ? (
        <FlatList
          data={displayedAccounts}
          keyExtractor={(item, index) => item.id || item.email || String(index)}
          renderItem={renderUserItem}
          contentContainerStyle={styles.listContent}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.4}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.primary} />}
          ListHeaderComponent={
            <View style={[styles.searchBox, { backgroundColor: theme.surfaceCard, borderColor: theme.border }]}>
              <Search size={16} color={theme.textMuted} />
              <TextInput
                style={[styles.searchInput, { color: theme.textPrimary }]}
                placeholder="Search name, email, code…"
                placeholderTextColor={theme.textMuted}
                value={search}
                onChangeText={setSearch}
              />
            </View>
          }
          ListEmptyComponent={
            error ? (
              <EmptyState icon={AlertCircle} title="Could not load accounts" message={error} tone="error" actionLabel="Retry" onAction={() => load()} />
            ) : (
              <EmptyState icon={ShieldCheck} title="No users found" message={search ? 'No matching users.' : 'No users in backend database.'} />
            )
          }
          ListFooterComponent={
            hasMoreAccounts ? (
              <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={theme.primary} />
                <Text style={{ ...typography.micro, color: theme.textMuted, marginTop: 6 }}>
                  Showing {displayedAccounts.length} of {filteredAccounts.length} users — Scroll for more
                </Text>
              </View>
            ) : (
              displayedAccounts.length > 0 ? (
                <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                  <Text style={{ ...typography.micro, color: theme.textMuted }}>
                    Showing all {displayedAccounts.length} users
                  </Text>
                </View>
              ) : null
            )
          }
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.primary} />}
        >
            /* ── Permission Matrix Tab ── */
            <>
              <View style={[styles.matrixLegend, { backgroundColor: theme.surfaceCard, borderColor: theme.border }]}>
                <View style={styles.legendItem}>
                  <CheckCircle2 size={14} color={theme.emerald} />
                  <Text style={[styles.legendText, { color: theme.textMuted }]}>Allowed</Text>
                </View>
                <View style={styles.legendItem}>
                  <XCircle size={14} color={theme.rose} />
                  <Text style={[styles.legendText, { color: theme.textMuted }]}>Denied</Text>
                </View>
                <Text style={[styles.legendText, { color: theme.textMuted }]}>  —  Not configured</Text>
              </View>

              {myPermissions ? (
                <PermissionMatrix rows={matrixRows} theme={theme} />
              ) : (
                <EmptyState
                  icon={Lock}
                  title="No permission data"
                  message="Could not load permission matrix. Super Admin has full access by default."
                />
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* User detail modal */}
      {selectedUser ? (
        <UserDetailModal user={selectedUser} systemPermissions={myPermissions} onClose={() => setSelectedUser(null)} theme={theme} />
      ) : null}
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerArea: { paddingHorizontal: 16, paddingTop: 12 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10 },
  backText: { ...typography.body, fontWeight: '600' },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { ...typography.h2, fontWeight: '800' },
  subtitle: { ...typography.caption, marginTop: 2, marginBottom: 12 },

  tabBar: { flexDirection: 'row', padding: 4, borderRadius: 12, marginBottom: 10, gap: 4 },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 9, gap: 5 },
  tabText: { ...typography.caption, fontWeight: '700' },

  listContent: { paddingHorizontal: 16, paddingBottom: 100 },
  searchBox: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, marginBottom: 12, gap: 8 },
  searchInput: { flex: 1, ...typography.body, padding: 0 },

  // User cards
  userCard: { marginBottom: 10, padding: 14 },
  userCardTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { ...typography.body, fontWeight: '800', fontSize: 15 },
  userCardInfo: { flex: 1 },
  userName: { ...typography.body, fontWeight: '800' },
  userEmail: { ...typography.caption, marginTop: 1 },
  userCardMeta: { flexDirection: 'row', gap: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  metaChip: { flex: 1 },
  metaChipKey: { ...typography.micro, fontWeight: '600', textTransform: 'uppercase' },
  metaChipVal: { ...typography.caption, fontWeight: '700', marginTop: 2 },

  // Permission matrix
  matrixLegend: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 10, borderWidth: 1, marginBottom: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendText: { ...typography.micro },

  matrixWrap: { borderRadius: 12, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  matrixHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1 },
  matrixResourceLabel: { flex: 1.8, ...typography.micro, fontWeight: '700', textTransform: 'uppercase' },
  matrixActionLabel: { width: 50, ...typography.micro, fontWeight: '700', textTransform: 'uppercase', textAlign: 'center' },
  matrixRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  matrixResource: { flex: 1.8, ...typography.caption, fontWeight: '700' },
  matrixCell: { width: 50, alignItems: 'center' },
  matrixDash: { ...typography.body, fontWeight: '700' },
  extraActionsRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  extraBadges: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  extraBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  extraBadgeText: { ...typography.micro, fontWeight: '700' },

  // Modal
  modalScreen: { flex: 1 },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1,
  },
  modalClose: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  modalBack: { ...typography.body, fontWeight: '600' },
  userHero: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1,
  },
  heroAvatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  heroInitials: { ...typography.h3, fontWeight: '800' },
  heroMid: { flex: 1 },
  heroName: { ...typography.h4, fontWeight: '800' },
  heroEmail: { ...typography.caption, marginTop: 2 },

  innerTabBar: { flexDirection: 'row', paddingHorizontal: 16, borderBottomWidth: 1 },
  innerTab: { paddingVertical: 12, paddingHorizontal: 4, marginRight: 24 },
  innerTabText: { ...typography.body, fontWeight: '600' },

  modalContent: { padding: 16, paddingBottom: 60 },
  infoCard: { padding: 0, overflow: 'hidden' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  infoLabel: { ...typography.caption, fontWeight: '600' },
  infoValue: { ...typography.caption, fontWeight: '700' },
  matrixTitle: { ...typography.micro, marginBottom: 10, lineHeight: 16 },
});
