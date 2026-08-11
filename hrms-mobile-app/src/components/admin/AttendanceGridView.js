import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, FlatList } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme';

const NAME_COL_WIDTH = 130;
const DAY_COL_WIDTH = 34;
const ROW_HEIGHT = 44;

const STATUS_GLYPH = { present: 'P', absent: 'A', half_day: 'H', leave: 'L' };
const STATUS_TINT = { present: 'emerald', absent: 'rose', half_day: 'amber', leave: 'violet' };

// Two side-by-side FlatLists (frozen name column + horizontally-scrollable
// day grid) kept in vertical sync by cross-driving each other's scroll
// offset — the standard RN pattern for a "frozen column" table, since
// there's no table/grid library in this app to lean on. The day-number
// header uses stickyHeaderIndices so it stays put while rows scroll under it.
export function AttendanceGridView({ employees, attendance, daysInMonth, yearMonth, onCellPress }) {
  const { theme } = useTheme();
  const leftListRef = useRef(null);
  const rightListRef = useRef(null);
  const syncingRef = useRef(false);

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const syncFrom = (source) => (e) => {
    if (syncingRef.current) {
      syncingRef.current = false;
      return;
    }
    syncingRef.current = true;
    const y = e.nativeEvent.contentOffset.y;
    const targetRef = source === 'left' ? rightListRef : leftListRef;
    targetRef.current?.scrollToOffset({ offset: y, animated: false });
  };

  return (
    <View style={styles.container}>
      <FlatList
        ref={leftListRef}
        style={{ width: NAME_COL_WIDTH }}
        data={employees}
        keyExtractor={(item) => String(item.id)}
        showsVerticalScrollIndicator={false}
        onScroll={syncFrom('left')}
        scrollEventThrottle={16}
        stickyHeaderIndices={[0]}
        ListHeaderComponent={
          <View style={[styles.cornerCell, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
            <Text style={[styles.headerText, { color: theme.textMuted }]}>Employee</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.nameCell, { borderColor: theme.border }]}>
            <Text style={[styles.nameText, { color: theme.textPrimary }]} numberOfLines={1}>{item.name || '—'}</Text>
            <Text style={[styles.codeText, { color: theme.textMuted }]} numberOfLines={1}>{item.emp_code}</Text>
          </View>
        )}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator style={{ flex: 1 }}>
        <FlatList
          ref={rightListRef}
          data={employees}
          keyExtractor={(item) => String(item.id)}
          showsVerticalScrollIndicator={false}
          onScroll={syncFrom('right')}
          scrollEventThrottle={16}
          stickyHeaderIndices={[0]}
          ListHeaderComponent={
            <View style={[styles.dayHeaderRow, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
              {days.map((d) => (
                <View key={d} style={styles.dayHeaderCell}>
                  <Text style={[styles.headerText, { color: theme.textMuted }]}>{d}</Text>
                </View>
              ))}
            </View>
          }
          renderItem={({ item }) => {
            const empDates = attendance[item.emp_code] || {};
            return (
              <View style={[styles.dayRow, { borderColor: theme.border }]}>
                {days.map((d) => {
                  const dateStr = `${yearMonth}-${String(d).padStart(2, '0')}`;
                  const status = empDates[dateStr];
                  const tint = status ? theme[STATUS_TINT[status]] : theme.textMuted;
                  const tintBg = status ? theme[`${STATUS_TINT[status]}Bg`] : 'transparent';
                  return (
                    <TouchableOpacity
                      key={d}
                      style={[styles.dayCell, { backgroundColor: tintBg, borderColor: theme.border }]}
                      onPress={() => onCellPress(item.emp_code, dateStr, status)}
                    >
                      <Text style={[styles.dayCellText, { color: tint }]}>{status ? STATUS_GLYPH[status] : ''}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          }}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row' },
  cornerCell: {
    width: NAME_COL_WIDTH, height: ROW_HEIGHT, justifyContent: 'center', paddingHorizontal: 10,
    borderBottomWidth: 1, borderRightWidth: 1,
  },
  headerText: { ...typography.micro, fontWeight: '700', textAlign: 'center' },
  nameCell: {
    width: NAME_COL_WIDTH, height: ROW_HEIGHT, justifyContent: 'center', paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderRightWidth: 1,
  },
  nameText: { ...typography.caption, fontWeight: '700' },
  codeText: { ...typography.micro, marginTop: 1 },
  dayHeaderRow: { flexDirection: 'row', height: ROW_HEIGHT, borderBottomWidth: 1 },
  dayHeaderCell: { width: DAY_COL_WIDTH, alignItems: 'center', justifyContent: 'center' },
  dayRow: { flexDirection: 'row', height: ROW_HEIGHT, borderBottomWidth: StyleSheet.hairlineWidth },
  dayCell: {
    width: DAY_COL_WIDTH, height: ROW_HEIGHT, alignItems: 'center', justifyContent: 'center',
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  dayCellText: { ...typography.caption, fontWeight: '700' },
});
