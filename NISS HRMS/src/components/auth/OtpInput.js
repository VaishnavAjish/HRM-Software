import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Animated, Easing } from 'react-native';
import { CheckCircle2 } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';

const LENGTH = 6;
const STAGE_SIZE = 170;
const RADIUS = 56;
const BOX = 40;
const GAP = 8;

const GATHER_MS = 500;
const SPIN_MS = 900;
const FADE_MS = 300;
const CHECK_MS = 700;

// Angle for each digit around the circle, starting at 12 o'clock and going
// clockwise — matches the web's OTP_CLOCK_POSITIONS layout.
function circlePos(i) {
  const angle = (i * (360 / LENGTH) - 90) * (Math.PI / 180);
  return { x: RADIUS * Math.cos(angle), y: RADIUS * Math.sin(angle) };
}

function rowPos(i) {
  return { x: (i - (LENGTH - 1) / 2) * (BOX + GAP), y: 0 };
}

// status: 'idle' | 'verifying' | 'success' | 'error'
export function OtpInput({ value, onChange, status = 'idle', boxSize = 46, onSuccessEnd }) {
  const { theme } = useTheme();
  const inputs = useRef([]);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const shakeAnims = useRef(Array.from({ length: LENGTH }, () => new Animated.Value(0))).current;

  const gather = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const stageFade = useRef(new Animated.Value(1)).current;
  const successScale = useRef(new Animated.Value(0)).current;
  const successRing = useRef(new Animated.Value(0)).current;
  const [successPhase, setSuccessPhase] = useState('gather'); // 'gather' | 'spin' | 'checkmark'

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
      gather.setValue(0);
      spin.setValue(0);
      stageFade.setValue(1);
      successScale.setValue(0);
      successRing.setValue(0);
      setSuccessPhase('gather');

      Animated.timing(gather, { toValue: 1, duration: GATHER_MS, easing: Easing.out(Easing.back(1.2)), useNativeDriver: true }).start(() => {
        setSuccessPhase('spin');
        Animated.timing(spin, { toValue: 1, duration: SPIN_MS, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }).start(() => {
          setSuccessPhase('checkmark');
          Animated.timing(stageFade, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start();
          Animated.sequence([
            Animated.delay(FADE_MS * 0.4),
            Animated.spring(successScale, { toValue: 1, friction: 5, useNativeDriver: true }),
          ]).start();
          Animated.timing(successRing, { toValue: 1, duration: CHECK_MS, useNativeDriver: true }).start(() => {
            onSuccessEnd?.();
          });
        });
      });
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
    const stageRotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '720deg'] });
    const counterRotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-720deg'] });

    return (
      <View style={styles.successWrap}>
        {successPhase !== 'checkmark' && (
          <Animated.View style={[styles.stage, { opacity: stageFade, transform: [{ rotate: stageRotate }] }]}>
            {Array.from({ length: LENGTH }).map((_, i) => {
              const row = rowPos(i);
              const circle = circlePos(i);
              const translateX = gather.interpolate({ inputRange: [0, 1], outputRange: [row.x, circle.x] });
              const translateY = gather.interpolate({ inputRange: [0, 1], outputRange: [row.y, circle.y] });
              return (
                <Animated.View key={i} style={[styles.orbitDigit, { transform: [{ translateX }, { translateY }] }]}>
                  <Animated.View style={{ transform: [{ rotate: counterRotate }] }}>
                    <View style={[styles.digitPill, { backgroundColor: theme.primary + '15', borderColor: theme.primary }]}>
                      <Text style={[styles.digitText, { color: theme.primary }]}>{value[i] || ''}</Text>
                    </View>
                  </Animated.View>
                </Animated.View>
              );
            })}
          </Animated.View>
        )}

        {successPhase === 'checkmark' && (
          <>
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
          </>
        )}
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
    height: STAGE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stage: {
    width: STAGE_SIZE,
    height: STAGE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbitDigit: {
    position: 'absolute',
  },
  digitPill: {
    width: BOX,
    height: BOX,
    borderRadius: BOX / 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digitText: {
    fontSize: 16,
    fontWeight: '700',
  },
  successRing: {
    position: 'absolute',
    width: 70,
    height: 70,
    borderRadius: 35,
  },
});
