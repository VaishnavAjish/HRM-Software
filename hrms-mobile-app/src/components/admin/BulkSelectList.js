import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { X, Square, CheckSquare } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme';

// Wraps a FlatList with a checkbox-select mode: long-press any row to enter
// selection, tap toggles thereafter, a header bar shows "N selected" plus
// whatever bulk actions the caller supplies. Shared by Employees (bulk
// delete), Shifts (assign employees), and Tickets (bulk actions).
export function BulkSelectList({
  data,
  keyExtractor,
  renderRow,
  renderBulkActions,
  emptyComponent,
  footerComponent,
  refreshControl,
  onEndReached,
  onEndReachedThreshold,
  contentContainerStyle,
}) {
  const { theme } = useTheme();
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const toggle = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (next.size === 0) setSelectionMode(false);
      return next;
    });
  };

  const enterSelection = (id) => {
    setSelectionMode(true);
    setSelectedIds(new Set([id]));
  };

  const clearSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  return (
    <View style={{ flex: 1 }}>
      {selectionMode ? (
        <View style={[styles.bar, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
          <TouchableOpacity onPress={clearSelection} hitSlop={8} style={styles.barLeft}>
            <X size={18} color={theme.textPrimary} />
            <Text style={[styles.barTitle, { color: theme.textPrimary }]}>{selectedIds.size} selected</Text>
          </TouchableOpacity>
          {renderBulkActions ? renderBulkActions(Array.from(selectedIds), { clearSelection }) : null}
        </View>
      ) : null}

      <FlatList
        data={data}
        keyExtractor={keyExtractor}
        contentContainerStyle={contentContainerStyle}
        refreshControl={refreshControl}
        onEndReached={onEndReached}
        onEndReachedThreshold={onEndReachedThreshold}
        ListEmptyComponent={emptyComponent}
        ListFooterComponent={footerComponent}
        renderItem={({ item }) => {
          const id = keyExtractor(item);
          const selected = selectedIds.has(id);
          return (
            <View style={styles.rowWrap}>
              {selectionMode ? (
                <TouchableOpacity onPress={() => toggle(id)} hitSlop={8} style={styles.checkbox}>
                  {selected ? <CheckSquare size={22} color={theme.primary} /> : <Square size={22} color={theme.textMuted} />}
                </TouchableOpacity>
              ) : null}
              <View style={{ flex: 1 }}>
                {renderRow(item, {
                  selected,
                  selectionMode,
                  toggle: () => toggle(id),
                  enterSelection: () => enterSelection(id),
                })}
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  barLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barTitle: { ...typography.body, fontWeight: '700' },
  rowWrap: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  checkbox: { marginRight: 10 },
});
