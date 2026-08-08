import React, { useEffect, useRef } from 'react';
import { View, TextInput, StyleSheet, Animated } from 'react-native';
import { CheckCircle2 } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';

const LENGTH = 6;

// status: 'idle' | 'verifying' | 'success' | 'error'
export function OtpInput({ value, onChange, status = 'idle', boxSize = 46 }) {
  const { theme } = useTheme();
  const inputs = useRef([]);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const successScale = useRef(new Animated.Value(0)).current;
  const successRing = useRef(new Animated.Value(0)).current;
  const shakeAnims = useRef(Array.from({ length: LENGTH }, () => new Animated.Value(0))).current;

  useEffect(() => {
    let pulseLoop;
    if (status === 'verifying') {
      pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.08, duration: 350, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
        ])
      );
      pulseLoop.start();
    } else {
      pulseAnim.setValue(1);
    }

    if (status === 'error') {
      const sequences = shakeAnims.map((av, i) =>
        Animated.sequence([
          Animated.delay(i * 60),
          Animated.timing(av, { toValue: 1, duration: 55, useNativeDriver: true }),
          Animated.timing(av, { toValue: -1, duration: 55, useNativeDriver: true }),
          Animated.timing(av, { toValue: 1, duration: 55, useNativeDriver: true }),
          Animated.timing(av, { toValue: 0, duration: 55, useNativeDriver: true }),
        ])
      );
      Animated.parallel(sequences).start();
    } else {
      shakeAnims.forEach((av) => av.setValue(0));
    }

    if (status === 'success') {
      successScale.setValue(0);
      successRing.setValue(0);
      Animated.sequence([
        Animated.delay(150),
        Animated.spring(successScale, { toValue: 1, friction: 5, useNativeDriver: true }),
      ]).start();
      Animated.timing(successRing, { toValue: 1, duration: 700, useNativeDriver: true }).start();
    }

    return () => {
      if (pulseLoop) pulseLoop.stop();
    };
  }, [status]);

  const setDigit = (index, char) => {
    const chars = value.padEnd(LENGTH, ' ').split('');
    chars[index] = char || ' ';
    const next = chars.join('').replace(/ /g, '');
    onChange(next);
    if (char && index < LENGTH - 1) inputs.current[index + 1]?.focus();
  };

  const handleKeyPress = (index, e) => {
    if (e.nativeEvent.key === 'Backspace' && !value[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  if (status === 'success') {
    return (
      <View style={styles.successWrap}>
        <Animated.View
          style={[
            styles.successRing,
            {
              backgroundColor: theme.emerald,
              opacity: successRing.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
              transform: [{ scale: successRing.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.9] }) }],
            },
          ]}
        />
        <Animated.View style={{ transform: [{ scale: successScale }] }}>
          <CheckCircle2 size={64} color={theme.emerald} />
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      {Array.from({ length: LENGTH }).map((_, i) => {
        const translateX = shakeAnims[i].interpolate({ inputRange: [-1, 1], outputRange: [-6, 6] });
        const filled = Boolean(value[i]);
        return (
          <Animated.View
            key={i}
            style={{
              transform: [
                { translateX: status === 'error' ? translateX : 0 },
                { scale: status === 'verifying' ? pulseAnim : 1 },
              ],
            }}
          >
            <TextInput
              ref={(r) => (inputs.current[i] = r)}
              value={value[i] || ''}
              onChangeText={(t) => setDigit(i, t.replace(/\D/g, '').slice(-1))}
              onKeyPress={(e) => handleKeyPress(i, e)}
              keyboardType="number-pad"
              maxLength={1}
              editable={status === 'idle'}
              style={[
                styles.box,
                {
                  width: boxSize,
                  height: boxSize + 10,
                  borderColor: status === 'error' ? theme.rose : filled ? theme.primary : theme.border,
                  backgroundColor: status === 'verifying' ? theme.primary + '15' : theme.surfaceElevated,
                  color: theme.textPrimary,
                },
              ]}
            />
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  box: {
    borderWidth: 1.5,
    borderRadius: 12,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '700',
  },
  successWrap: {
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successRing: {
    position: 'absolute',
    width: 70,
    height: 70,
    borderRadius: 35,
  },
});
