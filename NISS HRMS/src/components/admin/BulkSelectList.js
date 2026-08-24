import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { X, Square, CheckSquare } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme';

export function BulkSelectList({
  data,
  keyExtractor,
  renderItem,
  renderRow,
  bulkActions,
  renderBulkActions,
  ListEmptyComponent,
  emptyComponent,
  ListFooterComponent,
  footerComponent,
  refreshControl,
  onEndReached,
  onEndReachedThreshold,
  contentContainerStyle,
}) {
  const { theme } = useTheme();
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const rowRenderer = renderItem || renderRow;
  const emptyRes = ListEmptyComponent || emptyComponent;
  const footerRes = ListFooterComponent || footerComponent;

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
          {Array.isArray(bulkActions) && bulkActions.length > 0 ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {bulkActions.map((action) => (
                <TouchableOpacity
                  key={action.key || action.label}
                  onPress={() => action.onPress(Array.from(selectedIds))}
                  style={[styles.actionBtn, action.variant === 'destructive' && { backgroundColor: theme.roseBg }]}
                >
                  <Text style={[styles.actionText, action.variant === 'destructive' && { color: theme.rose }]}>
                    {action.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : renderBulkActions ? (
            renderBulkActions(Array.from(selectedIds), { clearSelection })
          ) : null}
        </View>
      ) : null}

      <FlatList
        data={Array.isArray(data) ? data : []}
        keyExtractor={keyExtractor || ((item, index) => String(item?.id || index))}
        contentContainerStyle={contentContainerStyle}
        refreshControl={refreshControl}
        onEndReached={onEndReached}
        onEndReachedThreshold={onEndReachedThreshold}
        ListEmptyComponent={emptyRes}
        ListFooterComponent={footerRes}
        renderItem={({ item, index }) => {
          const id = keyExtractor ? keyExtractor(item) : String(item?.id || index);
          const selected = selectedIds.has(id);
          return (
            <View style={styles.rowWrap}>
              {selectionMode ? (
                <TouchableOpacity onPress={() => toggle(id)} hitSlop={8} style={styles.checkbox}>
                  {selected ? <CheckSquare size={22} color={theme.primary} /> : <Square size={22} color={theme.textMuted} />}
                </TouchableOpacity>
              ) : null}
              <View style={{ flex: 1 }}>
                {rowRenderer
                  ? rowRenderer(item, selected, toggle, selectionMode, {
                      enterSelection: () => enterSelection(id),
                    })
                  : null}
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
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  barLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  barTitle: { ...typography.body, fontWeight: '700' },
  rowWrap: { flexDirection: 'row', alignItems: 'center' },
  checkbox: { paddingRight: 10 },
  actionBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  actionText: { ...typography.micro, fontWeight: '700' },
});
