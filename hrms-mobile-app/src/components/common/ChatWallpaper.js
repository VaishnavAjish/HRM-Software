import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Pattern, Rect, Path, Circle, G } from 'react-native-svg';
import { useTheme } from '../../context/ThemeContext';

export function ChatWallpaper({ children, style }) {
  const { theme, isDark } = useTheme();
  const strokeColor = isDark ? '#FFFFFF' : '#1E293B';
  const strokeOpacity = isDark ? 0.08 : 0.06;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }, style]}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width="100%" height="100%">
          <Pattern id="whatsapp-doodle-bg" width="180" height="180" patternUnits="userSpaceOnUse">
            <G stroke={strokeColor} strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={strokeOpacity}>
              {/* Chat bubble */}
              <Path d="M 20 20 C 15 20 10 25 10 30 C 10 35 15 40 20 40 L 25 40 L 25 45 L 30 40 L 35 40 C 40 40 45 35 45 30 C 45 25 40 20 35 20 Z" />
              {/* Heart */}
              <Path d="M 70 25 C 65 20 60 25 60 30 C 60 38 70 45 70 45 C 70 45 80 38 80 30 C 80 25 75 20 70 25 Z" />
              {/* Smiley */}
              <Circle cx="120" cy="30" r="12" />
              <Circle cx="116" cy="27" r="1.5" fill={strokeColor} />
              <Circle cx="124" cy="27" r="1.5" fill={strokeColor} />
              <Path d="M 116 34 Q 120 38 124 34" />
              {/* Star */}
              <Path d="M 160 20 L 163 26 L 170 27 L 165 32 L 166 39 L 160 36 L 154 39 L 155 32 L 150 27 L 157 26 Z" />

              {/* Lock */}
              <Rect x="20" y="80" width="16" height="14" rx="2" />
              <Path d="M 24 80 L 24 74 C 24 70 32 70 32 74 L 32 80" />

              {/* Music note */}
              <Path d="M 75 75 L 75 90 M 75 75 L 85 70 L 85 85 M 75 80 L 85 75" />
              <Circle cx="72" cy="90" r="3" fill={strokeColor} />
              <Circle cx="82" cy="85" r="3" fill={strokeColor} />

              {/* Phone */}
              <Rect x="115" y="75" width="12" height="20" rx="3" />
              <Circle cx="121" cy="91" r="1" fill={strokeColor} />

              {/* Thumbs up */}
              <Path d="M 155 90 L 155 82 C 155 80 157 75 160 75 C 163 75 163 78 163 80 L 163 83 L 168 83 C 170 83 172 85 172 87 L 170 94 C 169 96 167 97 165 97 L 155 97 Z" />

              {/* Camera */}
              <Rect x="15" y="135" width="20" height="14" rx="2" />
              <Circle cx="25" cy="142" r="4" />
              <Path d="M 21 135 L 23 131 L 27 131 L 29 135" />

              {/* Coffee cup */}
              <Path d="M 65 135 L 80 135 L 78 147 C 78 150 72 150 67 147 Z M 80 137 L 83 137 C 85 137 85 142 80 142" />

              {/* Bell */}
              <Path d="M 120 130 C 115 130 113 135 113 140 L 127 140 C 127 135 125 130 120 130 Z M 118 143 C 118 145 122 145 122 143" />

              {/* Search Glass */}
              <Circle cx="160" cy="138" r="7" />
              <Path d="M 165 143 L 172 150" />
            </G>
          </Pattern>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#whatsapp-doodle-bg)" />
        </Svg>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
