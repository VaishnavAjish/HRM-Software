import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, FlatList } from 'react-native';
import { ChevronDown, Check, X, Search } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { typography, shadows } from '../../theme';

// A proper dropdown: the field shows the current value and opens a searchable,
// scrollable modal list — used in place of a chip row once there are more
// than a handful of options (e.g. Department).
export function SelectField({ label, value, onChange, options, placeholder = 'Select…', disabled, searchable = true }) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const normalized = useMemo(
    () => (Array.isArray(options) ? options : []).map((o) => (typeof o === 'string' ? { value: o, label: o } : o)),
    [options]
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return normalized;
    const q = query.trim().toLowerCase();
    return normalized.filter((o) => o.label.toLowerCase().includes(q));
  }, [normalized, query]);

  const selected = normalized.find((o) => o.value === value);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  return (
    <View style={styles.container}>
      {label ? <Text style={[styles.label, { color: theme.textMuted }]}>{label}</Text> : null}
      <TouchableOpacity
        activeOpacity={0.7}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[
          styles.field,
          { borderColor: theme.border, backgroundColor: disabled ? theme.border : theme.surfaceElevated },
        ]}
      >
        <Text style={[styles.value, { color: selected ? theme.textPrimary : theme.textMuted }]} numberOfLines={1}>
          {selected ? selected.label : placeholder}
        </Text>
        <ChevronDown size={16} color={theme.textMuted} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={close}>
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.sheet, { backgroundColor: theme.surfaceCard, borderColor: theme.border }, shadows.glass]}
            onPress={() => {}}
          >
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: theme.textPrimary }]}>{label || 'Select an option'}</Text>
              <TouchableOpacity onPress={close} hitSlop={8}>
                <X size={20} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            {searchable && normalized.length > 6 ? (
              <View style={[styles.searchWrap, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
                <Search size={15} color={theme.textMuted} style={{ marginRight: 8 }} />
                <TextInput
                  style={[styles.searchInput, { color: theme.textPrimary }]}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search…"
                  placeholderTextColor={theme.textMuted}
                  autoFocus
                />
              </View>
            ) : null}

            <FlatList
              data={filtered}
              keyExtractor={(item) => item.value}
              style={styles.list}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={[styles.emptyText, { color: theme.textMuted }]}>No matches</Text>}
              renderItem={({ item }) => {
                const isSelected = item.value === value;
                return (
                  <TouchableOpacity
                    style={[styles.option, isSelected && { backgroundColor: theme.primary + '15' }]}
                    onPress={() => {
                      onChange(item.value);
                      close();
                    }}
                  >
                    <Text style={[styles.optionText, { color: isSelected ? theme.primary : theme.textPrimary }]}>
                      {item.label}
                    </Text>
                    {isSelected ? <Check size={16} color={theme.primary} /> : null}
                  </TouchableOpacity>
                );
              }}
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 14,
  },
  label: {
    ...typography.caption,
    marginBottom: 6,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  value: {
    fontSize: 14,
    flexShrink: 1,
    marginRight: 8,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    padding: 18,
    maxHeight: '75%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sheetTitle: {
    ...typography.h4,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
  },
  list: {
    flexGrow: 0,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  optionText: {
    ...typography.body,
    flexShrink: 1,
  },
  emptyText: {
    ...typography.body,
    textAlign: 'center',
    paddingVertical: 20,
  },
});
