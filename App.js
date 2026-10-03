import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Alert,
  Modal,
  PanResponder,
  Animated,
  Share,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Feather, Ionicons } from '@expo/vector-icons';

const STORAGE_KEY = '@prayday_data_v2';
const DEFAULT_START_DATE = '2016-07-29';
const DEFAULT_END_DATE = '2026-10-03';

const ESSENTIAL_PRAYERS = [
  { id: 'fajr', name: 'Fajr', rakaas: 2 },
  { id: 'dhuhr', name: 'Dhuhr', rakaas: 4 },
  { id: 'asr', name: 'Asr', rakaas: 4 },
  { id: 'maghrib', name: 'Maghrib', rakaas: 3 },
  { id: 'isha', name: 'Isha', rakaas: 4 },
];

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function getDaysBetween(date1, date2) {
  const d1 = new Date(date1.getFullYear(), date1.getMonth(), date1.getDate());
  const d2 = new Date(date2.getFullYear(), date2.getMonth(), date2.getDate());
  const diffTime = d2.getTime() - d1.getTime();
  return Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
}

export default function App() {
  const today = new Date();
  const todayKey = formatDateKey(today);

  const [currentDate, setCurrentDate] = useState(today);
  const [isDebtCollapsed, setIsDebtCollapsed] = useState(false);
  const [isLightMode, setIsLightMode] = useState(false);

  // Modals
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');

  // Settings inputs
  const [inputStartDate, setInputStartDate] = useState(DEFAULT_START_DATE);
  const [inputEndDate, setInputEndDate] = useState(DEFAULT_END_DATE);
  const [customRakaasInput, setCustomRakaasInput] = useState('');

  // Animated slide transition for day swiping
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Main Persistent Data Structure
  const [appData, setAppData] = useState({
    debtStartDate: DEFAULT_START_DATE,
    debtEndDate: DEFAULT_END_DATE,
    baseInitialDebt: 0,
    addedMissedRakaas: 0,
    isLightMode: false,
    days: {},
  });

  const [isLoaded, setIsLoaded] = useState(false);

  const triggerFeedback = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (_) {}
  };

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          setAppData(parsed);
          setInputStartDate(parsed.debtStartDate || DEFAULT_START_DATE);
          setInputEndDate(parsed.debtEndDate || DEFAULT_END_DATE);
          setIsLightMode(!!parsed.isLightMode);
        } else {
          const s = parseDateKey(DEFAULT_START_DATE);
          const e = parseDateKey(DEFAULT_END_DATE);
          const daysCount = getDaysBetween(s, e);
          const baseDebt = daysCount * 17;

          const initial = {
            debtStartDate: DEFAULT_START_DATE,
            debtEndDate: DEFAULT_END_DATE,
            baseInitialDebt: baseDebt,
            addedMissedRakaas: 0,
            isLightMode: false,
            days: {},
          };
          setAppData(initial);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (isLoaded) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...appData, isLightMode }));
    }
  }, [appData, isLightMode, isLoaded]);

  const currentKey = formatDateKey(currentDate);
  const currentDayData = appData.days[currentKey] || {
    essentials: {},
    sunnahs: {},
    extraRakaas: 0,
  };

  const isFriday = currentDate.getDay() === 5;
  const isViewingToday = currentKey === todayKey;

  const theme = isLightMode ? lightTheme : darkTheme;

  const changeDayWithAnimation = (delta) => {
    const slideDirection = delta > 0 ? -1 : 1;
    Animated.timing(slideAnim, {
      toValue: slideDirection * 60,
      duration: 120,
      useNativeDriver: true,
    }).start(() => {
      const next = new Date(currentDate);
      next.setDate(next.getDate() + delta);
      setCurrentDate(next);
      slideAnim.setValue(-slideDirection * 60);
      Animated.spring(slideAnim, {
        toValue: 0,
        friction: 8,
        tension: 50,
        useNativeDriver: true,
      }).start();
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 35 && Math.abs(gestureState.dy) < 30;
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > 40) {
          changeDayWithAnimation(-1);
        } else if (gestureState.dx < -40) {
          changeDayWithAnimation(1);
        }
      },
    })
  ).current;

  const calculateTotalPaid = () => {
    let total = 0;
    const endDate = parseDateKey(appData.debtEndDate);

    Object.keys(appData.days).forEach((key) => {
      const date = parseDateKey(key);
      if (date >= endDate) {
        const d = appData.days[key];
        if (d.sunnahs) {
          if (d.sunnahs.fajr_before) total += 2;
          if (d.sunnahs.dhuhr_before) total += 4;
          if (d.sunnahs.dhuhr_after) total += 2;
          if (d.sunnahs.maghrib_after) total += 2;
          if (d.sunnahs.isha_after) total += 2;
        }
        if (d.extraRakaas) {
          total += Number(d.extraRakaas) || 0;
        }
      }
    });
    return total;
  };

  const totalPaidRakaas = calculateTotalPaid();
  const totalDebtDenominator = (appData.baseInitialDebt || 0) + (appData.addedMissedRakaas || 0);
  const remainingDebt = Math.max(0, totalDebtDenominator - totalPaidRakaas);

  const progressPercent = Math.min(
    100,
    Math.max(0, totalDebtDenominator > 0 ? (totalPaidRakaas / totalDebtDenominator) * 100 : 0)
  );

  const accountabilityStart = parseDateKey(appData.debtEndDate);
  accountabilityStart.setDate(accountabilityStart.getDate() + 1);

  const getOverduePrayers = () => {
    const overdue = [];
    const checkDays = 30;

    for (let i = 1; i <= checkDays; i++) {
      const pastDate = new Date(today);
      pastDate.setDate(pastDate.getDate() - i);
      const pastKey = formatDateKey(pastDate);

      if (pastDate < accountabilityStart) break;

      const pData = appData.days[pastKey] || { essentials: {} };
      ESSENTIAL_PRAYERS.forEach((prayer) => {
        if (!pData.essentials?.[prayer.id]) {
          overdue.push({
            dateKey: pastKey,
            dateLabel: `${pastDate.getDate()}/${pastDate.getMonth() + 1}`,
            prayerId: prayer.id,
            name: prayer.name,
            rakaas: prayer.rakaas,
          });
        }
      });
    }
    return overdue;
  };

  const overduePrayers = getOverduePrayers();

  const handleSaveDebtSettings = () => {
    const newStart = parseDateKey(inputStartDate);
    const newEnd = parseDateKey(inputEndDate);

    if (isNaN(newStart.getTime()) || isNaN(newEnd.getTime()) || newEnd <= newStart) {
      Alert.alert('Invalid Dates', 'Please provide valid dates in YYYY-MM-DD format with the end date occurring after the start date.');
      return;
    }

    const newDays = getDaysBetween(newStart, newEnd);
    const newBaseDebt = newDays * 17;
    const oldBaseDebt = appData.baseInitialDebt;

    Alert.alert(
      'Recalculate Debt Period?',
      `Changing debt dates will update your starting debt from ${oldBaseDebt.toLocaleString()} to ${newBaseDebt.toLocaleString()} Raka'as.\n\nYour accumulated ${totalPaidRakaas.toLocaleString()} paid Raka'as will be retained and deducted from this new debt.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm & Update',
          style: 'destructive',
          onPress: () => {
            setAppData((prev) => ({
              ...prev,
              debtStartDate: inputStartDate,
              debtEndDate: inputEndDate,
              baseInitialDebt: newBaseDebt,
            }));
            setSettingsModalVisible(false);
          },
        },
      ]
    );
  };

  const toggleEssential = (prayerId, targetDateKey = currentKey) => {
    triggerFeedback();
    const day = appData.days[targetDateKey] || { essentials: {}, sunnahs: {}, extraRakaas: 0 };
    const currentStatus = !!day.essentials?.[prayerId];
    const newStatus = !currentStatus;

    setAppData((prev) => {
      const updatedDay = {
        ...day,
        essentials: {
          ...day.essentials,
          [prayerId]: newStatus,
        },
      };

      let addedMissedRakaas = prev.addedMissedRakaas;
      const targetDate = parseDateKey(targetDateKey);

      if (targetDateKey < todayKey && targetDate >= accountabilityStart) {
        const prayerInfo = ESSENTIAL_PRAYERS.find((p) => p.id === prayerId);
        const rakaas = prayerInfo?.rakaas || 0;
        addedMissedRakaas = newStatus
          ? Math.max(0, addedMissedRakaas - rakaas)
          : addedMissedRakaas + rakaas;
      }

      return {
        ...prev,
        addedMissedRakaas,
        days: {
          ...prev.days,
          [targetDateKey]: updatedDay,
        },
      };
    });
  };

  const toggleSunnah = (sunnahId) => {
    triggerFeedback();
    const day = currentDayData;
    const currentVal = !!day.sunnahs?.[sunnahId];

    setAppData((prev) => ({
      ...prev,
      days: {
        ...prev.days,
        [currentKey]: {
          ...day,
          sunnahs: {
            ...day.sunnahs,
            [sunnahId]: !currentVal,
          },
        },
      },
    }));
  };

  const handleAddExtraRakaas = () => {
    const val = parseInt(customRakaasInput, 10);
    if (isNaN(val) || val <= 0) return;
    triggerFeedback();

    const day = currentDayData;
    const currentExtra = Number(day.extraRakaas || 0);

    setAppData((prev) => ({
      ...prev,
      days: {
        ...prev.days,
        [currentKey]: {
          ...day,
          extraRakaas: currentExtra + val,
        },
      },
    }));
    setCustomRakaasInput('');
  };

  const exportData = async () => {
    const json = JSON.stringify(appData, null, 2);
    if (Platform.OS === 'web') {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `prayday_backup_${todayKey}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      try {
        await Share.share({ title: 'Prayday Backup', message: json });
      } catch (e) {
        Alert.alert('Export Error', 'Could not share backup.');
      }
    }
  };

  const handleConfirmImport = () => {
    try {
      const parsed = JSON.parse(importJsonText);
      if (parsed && parsed.baseInitialDebt !== undefined) {
        Alert.alert(
          'Warning: Overwrite Data?',
          'This will overwrite your existing prayer logs and data. Are you sure?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Yes, Overwrite',
              style: 'destructive',
              onPress: () => {
                setAppData(parsed);
                setInputStartDate(parsed.debtStartDate || DEFAULT_START_DATE);
                setInputEndDate(parsed.debtEndDate || DEFAULT_END_DATE);
                setIsLightMode(!!parsed.isLightMode);
                setImportModalVisible(false);
                setImportJsonText('');
                Alert.alert('Success', 'Data restored successfully.');
              },
            },
          ]
        );
      } else {
        Alert.alert('Invalid Data', 'The provided data structure is incorrect.');
      }
    } catch (e) {
      Alert.alert('Parse Error', 'Invalid JSON backup format.');
    }
  };

  const dayNumber = currentDate.getDate();
  const monthShort = currentDate.toLocaleString('default', { month: 'short' }).toUpperCase();
  const isPastDay = currentKey < todayKey && currentDate >= accountabilityStart;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.bg }]}>
      <StatusBar
        barStyle={isLightMode ? 'dark-content' : 'light-content'}
        backgroundColor={theme.bg}
      />
      <View style={[styles.container, { backgroundColor: theme.bg }]} {...panResponder.panHandlers}>
        {/* Header Bar */}
        <View style={styles.header}>
          <Text style={[styles.brandTitle, { color: theme.primary }]}>Prayday</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => setIsLightMode(!isLightMode)}
              style={[styles.iconBtn, { backgroundColor: theme.cardBg }]}
            >
              <Feather
                name={isLightMode ? 'moon' : 'sun'}
                size={18}
                color={theme.iconColor}
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={exportData}
              style={[styles.iconBtn, { backgroundColor: theme.cardBg }]}
            >
              <Feather name="download" size={18} color={theme.iconColor} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setImportModalVisible(true)}
              style={[styles.iconBtn, { backgroundColor: theme.cardBg }]}
            >
              <Feather name="upload" size={18} color={theme.iconColor} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* Raka'a Debt Dashboard Card */}
          <View style={[styles.debtCard, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
            <View style={styles.debtCardTopRow}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setIsDebtCollapsed(!isDebtCollapsed)}
                style={styles.debtTitleGroup}
              >
                <Text style={[styles.debtCardTitle, { color: theme.subtext }]}>Raka'a Debt</Text>
                <Feather
                  name={isDebtCollapsed ? 'chevron-down' : 'chevron-up'}
                  size={16}
                  color={theme.subtext}
                  style={{ marginLeft: 6 }}
                />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setSettingsModalVisible(true)}
                style={styles.settingsIconBtn}
              >
                <Feather name="settings" size={18} color={theme.iconColor} />
              </TouchableOpacity>
            </View>

            {isDebtCollapsed ? (
              <Text style={[styles.debtValueCollapsed, { color: theme.text }]}>
                {remainingDebt.toLocaleString()} Raka'as left ({progressPercent.toFixed(1)}%)
              </Text>
            ) : (
              <>
                <View style={styles.debtDisplayRow}>
                  <Text style={[styles.debtNumber, { color: theme.text }]}>
                    {remainingDebt.toLocaleString()}
                  </Text>
                  <View style={styles.paidBadge}>
                    <Text style={styles.paidBadgeText}>-{totalPaidRakaas.toLocaleString()}</Text>
                  </View>
                </View>

                <View style={[styles.projectionsContainer, { backgroundColor: theme.subCardBg }]}>
                  <Text style={[styles.projectionLine, { color: theme.subtext }]}>
                    • If you pray 4 raka'as extra: covered in{' '}
                    <Text style={[styles.boldText, { color: theme.primary }]}>
                      {Math.ceil(remainingDebt / 4).toLocaleString()}
                    </Text>{' '}
                    days
                  </Text>
                  <Text style={[styles.projectionLine, { color: theme.subtext }]}>
                    • If you pray 8 raka'as extra: covered in{' '}
                    <Text style={[styles.boldText, { color: theme.primary }]}>
                      {Math.ceil(remainingDebt / 8).toLocaleString()}
                    </Text>{' '}
                    days
                  </Text>
                  <Text style={[styles.projectionLine, { color: theme.subtext }]}>
                    • If you pray 10 raka'as extra: covered in{' '}
                    <Text style={[styles.boldText, { color: theme.primary }]}>
                      {Math.ceil(remainingDebt / 10).toLocaleString()}
                    </Text>{' '}
                    days
                  </Text>
                  <Text style={[styles.projectionLine, { color: theme.subtext }]}>
                    • If you pray 12 raka'as extra: covered in{' '}
                    <Text style={[styles.boldText, { color: theme.primary }]}>
                      {Math.ceil(remainingDebt / 12).toLocaleString()}
                    </Text>{' '}
                    days
                  </Text>
                </View>
              </>
            )}

            <View style={[styles.progressBarWrapper, { backgroundColor: theme.progressTrack }]}>
              <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
            </View>
            <View style={styles.progressLabels}>
              <Text style={[styles.progressSubtext, { color: theme.muted }]}>
                Paid: {totalPaidRakaas.toLocaleString()} Raka'as
              </Text>
              <Text style={[styles.progressSubtext, { color: theme.muted }]}>
                {progressPercent.toFixed(1)}%
              </Text>
            </View>
          </View>

          {/* Date Navigation & Badge */}
          <View style={styles.dateNavSection}>
            <TouchableOpacity onPress={() => changeDayWithAnimation(-1)} style={styles.navArrowBtn}>
              <Feather name="chevron-left" size={26} color={theme.text} />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setCalendarVisible(true)}
              style={[styles.dateBadge, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}
            >
              <Text style={[styles.dateNumber, { color: theme.text }]}>{dayNumber}</Text>
              <Text style={[styles.dateMonth, { color: theme.primary }]}>{monthShort}</Text>

              {!isViewingToday && (
                <TouchableOpacity
                  style={styles.todayClockBadge}
                  onPress={() => setCurrentDate(new Date())}
                >
                  <Feather name="clock" size={12} color="#FFFFFF" />
                </TouchableOpacity>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => changeDayWithAnimation(1)} style={styles.navArrowBtn}>
              <Feather name="chevron-right" size={26} color={theme.text} />
            </TouchableOpacity>
          </View>

          {/* Animated Prayer Log Container */}
          <Animated.View
            style={[
              styles.prayerLogCard,
              {
                backgroundColor: theme.cardBg,
                borderColor: theme.cardBorder,
                transform: [{ translateX: slideAnim }],
              },
            ]}
          >
            {/* Fajr */}
            <PrayerRow
              name="Fajr"
              isDone={!!currentDayData.essentials?.fajr}
              isMissedPast={isPastDay && !currentDayData.essentials?.fajr}
              onToggleEssential={() => toggleEssential('fajr')}
              theme={theme}
              leftSunnah={{
                label: '+2',
                active: !!currentDayData.sunnahs?.fajr_before,
                onPress: () => toggleSunnah('fajr_before'),
              }}
            />

            {/* Dhuhr */}
            <PrayerRow
              name={isFriday ? "Jumu'ah" : 'Dhuhr'}
              isDone={!!currentDayData.essentials?.dhuhr}
              isMissedPast={isPastDay && !currentDayData.essentials?.dhuhr}
              onToggleEssential={() => toggleEssential('dhuhr')}
              theme={theme}
              leftSunnah={
                isFriday
                  ? null
                  : {
                      label: '+4',
                      active: !!currentDayData.sunnahs?.dhuhr_before,
                      onPress: () => toggleSunnah('dhuhr_before'),
                    }
              }
              rightSunnah={{
                label: '+2',
                active: !!currentDayData.sunnahs?.dhuhr_after,
                onPress: () => toggleSunnah('dhuhr_after'),
              }}
            />

            {/* Asr */}
            <PrayerRow
              name="Asr"
              isDone={!!currentDayData.essentials?.asr}
              isMissedPast={isPastDay && !currentDayData.essentials?.asr}
              onToggleEssential={() => toggleEssential('asr')}
              theme={theme}
            />

            {/* Maghrib */}
            <PrayerRow
              name="Maghrib"
              isDone={!!currentDayData.essentials?.maghrib}
              isMissedPast={isPastDay && !currentDayData.essentials?.maghrib}
              onToggleEssential={() => toggleEssential('maghrib')}
              theme={theme}
              rightSunnah={{
                label: '+2',
                active: !!currentDayData.sunnahs?.maghrib_after,
                onPress: () => toggleSunnah('maghrib_after'),
              }}
            />

            {/* Isha */}
            <PrayerRow
              name="Isha"
              isDone={!!currentDayData.essentials?.isha}
              isMissedPast={isPastDay && !currentDayData.essentials?.isha}
              onToggleEssential={() => toggleEssential('isha')}
              theme={theme}
              rightSunnah={{
                label: '+2',
                active: !!currentDayData.sunnahs?.isha_after,
                onPress: () => toggleSunnah('isha_after'),
              }}
            />

            {/* Row 6: Additional Raka'as */}
            <View style={[styles.extraRakaaRow, { borderTopColor: theme.divider }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.extraRowTitle, { color: theme.text }]}>Additional Raka'as</Text>
                <Text style={[styles.extraRowSubtitle, { color: theme.muted }]}>
                  Logged today: {currentDayData.extraRakaas || 0} Raka'as
                </Text>
              </View>
              <TextInput
                style={[styles.extraInput, { backgroundColor: theme.inputBg, borderColor: theme.cardBorder, color: theme.text }]}
                keyboardType="numeric"
                placeholder="4"
                placeholderTextColor={theme.muted}
                value={customRakaasInput}
                onChangeText={setCustomRakaasInput}
              />
              <TouchableOpacity onPress={handleAddExtraRakaas} style={styles.addExtraBtn}>
                <Ionicons name="add" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </Animated.View>

          {/* Row 7: Missed Prayers Alert */}
          {overduePrayers.length > 0 && (
            <View style={[styles.latePrayersCard, { backgroundColor: theme.lateCardBg, borderColor: theme.lateBorder }]}>
              <Text style={styles.lateTitle}>You are late on these prayers:</Text>
              <View style={styles.lateButtonsWrap}>
                {overduePrayers.map((item, idx) => (
                  <TouchableOpacity
                    key={`${item.dateKey}_${item.prayerId}_${idx}`}
                    onPress={() => toggleEssential(item.prayerId, item.dateKey)}
                    style={styles.lateBadgeBtn}
                  >
                    <Text style={styles.lateBadgeText}>
                      {item.name} ({item.dateLabel})
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </ScrollView>

        {/* Debt Settings Modal */}
        <Modal visible={settingsModalVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>Debt Date Settings</Text>
                <TouchableOpacity onPress={() => setSettingsModalVisible(false)}>
                  <Feather name="x" size={20} color={theme.subtext} />
                </TouchableOpacity>
              </View>
              <View style={styles.modalBody}>
                <Text style={[styles.modalHelper, { color: theme.subtext }]}>
                  Specify the period used to compute your starting debt (17 Raka'as per day).
                </Text>

                <Text style={[styles.inputLabel, { color: theme.text }]}>Start Date (YYYY-MM-DD)</Text>
                <TextInput
                  style={[styles.modalTextInput, { backgroundColor: theme.inputBg, borderColor: theme.cardBorder, color: theme.text }]}
                  value={inputStartDate}
                  onChangeText={setInputStartDate}
                  placeholder="2016-07-29"
                  placeholderTextColor={theme.muted}
                />

                <Text style={[styles.inputLabel, { color: theme.text }]}>End Date (YYYY-MM-DD)</Text>
                <TextInput
                  style={[styles.modalTextInput, { backgroundColor: theme.inputBg, borderColor: theme.cardBorder, color: theme.text }]}
                  value={inputEndDate}
                  onChangeText={setInputEndDate}
                  placeholder="2026-10-03"
                  placeholderTextColor={theme.muted}
                />

                <TouchableOpacity
                  style={[styles.modalPrimaryBtn, { backgroundColor: theme.primary }]}
                  onPress={handleSaveDebtSettings}
                >
                  <Text style={styles.modalPrimaryBtnText}>Save & Recalculate</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Date Selector Modal */}
        <Modal visible={calendarVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>Select Date</Text>
                <TouchableOpacity onPress={() => setCalendarVisible(false)}>
                  <Feather name="x" size={20} color={theme.subtext} />
                </TouchableOpacity>
              </View>
              <View style={styles.modalBody}>
                <Text style={[styles.modalHelper, { color: theme.subtext }]}>Quick Select</Text>
                <View style={styles.quickDateRow}>
                  <TouchableOpacity
                    style={[styles.quickDateBtn, { backgroundColor: theme.subCardBg, borderColor: theme.cardBorder }]}
                    onPress={() => {
                      setCurrentDate(new Date());
                      setCalendarVisible(false);
                    }}
                  >
                    <Text style={[styles.quickDateText, { color: theme.primary }]}>Today</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.quickDateBtn, { backgroundColor: theme.subCardBg, borderColor: theme.cardBorder }]}
                    onPress={() => {
                      const y = new Date();
                      y.setDate(y.getDate() - 1);
                      setCurrentDate(y);
                      setCalendarVisible(false);
                    }}
                  >
                    <Text style={[styles.quickDateText, { color: theme.primary }]}>Yesterday</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </Modal>

        {/* Import Backup Modal */}
        <Modal visible={importModalVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>Import Backup</Text>
                <TouchableOpacity onPress={() => setImportModalVisible(false)}>
                  <Feather name="x" size={20} color={theme.subtext} />
                </TouchableOpacity>
              </View>
              <View style={styles.modalBody}>
                <Text style={[styles.modalHelper, { color: theme.subtext }]}>
                  Paste your backup JSON text below to restore your progress:
                </Text>
                <TextInput
                  style={[styles.importTextInput, { backgroundColor: theme.inputBg, borderColor: theme.cardBorder, color: theme.text }]}
                  multiline
                  placeholder="Paste JSON data here..."
                  placeholderTextColor={theme.muted}
                  value={importJsonText}
                  onChangeText={setImportJsonText}
                />
                <TouchableOpacity
                  style={[styles.modalPrimaryBtn, { backgroundColor: theme.primary }]}
                  onPress={handleConfirmImport}
                >
                  <Text style={styles.modalPrimaryBtnText}>Restore Backup</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

function PrayerRow({ name, isDone, isMissedPast, onToggleEssential, leftSunnah, rightSunnah, theme }) {
  return (
    <View style={[styles.rowContainer, { borderBottomColor: theme.divider }]}>
      <Text style={[styles.prayerName, { color: theme.text }]}>{name}</Text>

      <View style={styles.sunnahSlot}>
        {leftSunnah && (
          <TouchableOpacity
            onPress={leftSunnah.onPress}
            style={[
              styles.sunnahBtn,
              { backgroundColor: theme.subCardBg, borderColor: theme.cardBorder },
              leftSunnah.active && styles.sunnahActive,
            ]}
          >
            <Text
              style={[
                styles.sunnahText,
                { color: theme.subtext },
                leftSunnah.active && styles.sunnahTextActive,
              ]}
            >
              {leftSunnah.label}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        onPress={onToggleEssential}
        style={[
          styles.essentialBtn,
          { backgroundColor: theme.subCardBg, borderColor: theme.cardBorder },
          isDone && styles.essentialBtnDone,
          !isDone && isMissedPast && styles.essentialBtnMissed,
        ]}
      >
        <Feather
          name="check"
          size={20}
          color={isDone ? '#FFFFFF' : isMissedPast ? '#EF4444' : theme.muted}
        />
      </TouchableOpacity>

      <View style={styles.sunnahSlot}>
        {rightSunnah && (
          <TouchableOpacity
            onPress={rightSunnah.onPress}
            style={[
              styles.sunnahBtn,
              { backgroundColor: theme.subCardBg, borderColor: theme.cardBorder },
              rightSunnah.active && styles.sunnahActive,
            ]}
          >
            <Text
              style={[
                styles.sunnahText,
                { color: theme.subtext },
                rightSunnah.active && styles.sunnahTextActive,
              ]}
            >
              {rightSunnah.label}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// Color schemes
const darkTheme = {
  bg: '#090D16',
  cardBg: '#1E293B',
  subCardBg: '#0F172A',
  cardBorder: '#334155',
  divider: '#0F172A',
  inputBg: '#0F172A',
  text: '#F8FAFC',
  subtext: '#94A3B8',
  muted: '#64748B',
  primary: '#38BDF8',
  iconColor: '#94A3B8',
  progressTrack: '#334155',
  lateCardBg: '#3B181E',
  lateBorder: '#7F1D1D',
};

const lightTheme = {
  bg: '#F1F5F9',
  cardBg: '#FFFFFF',
  subCardBg: '#F8FAFC',
  cardBorder: '#E2E8F0',
  divider: '#F1F5F9',
  inputBg: '#F8FAFC',
  text: '#0F172A',
  subtext: '#475569',
  muted: '#94A3B8',
  primary: '#0284C7',
  iconColor: '#64748B',
  progressTrack: '#E2E8F0',
  lateCardBg: '#FEF2F2',
  lateBorder: '#FECACA',
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    // Add top padding matching device status bar height on Android, plus safe spacing
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 6 : 0,
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 14,
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 10,
  },
  iconBtn: {
    padding: 8,
    borderRadius: 8,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  debtCard: {
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
  },
  debtCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  debtTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  debtCardTitle: {
    fontSize: 13,
    textTransform: 'uppercase',
    fontWeight: '700',
    letterSpacing: 1,
  },
  settingsIconBtn: {
    padding: 4,
  },
  debtDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
    gap: 12,
  },
  debtValueCollapsed: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 6,
  },
  debtNumber: {
    fontSize: 36,
    fontWeight: '800',
  },
  paidBadge: {
    backgroundColor: '#10B98120',
    borderColor: '#10B981',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  paidBadgeText: {
    color: '#10B981',
    fontSize: 14,
    fontWeight: '700',
  },
  projectionsContainer: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    gap: 4,
  },
  projectionLine: {
    fontSize: 12,
  },
  boldText: {
    fontWeight: '700',
  },
  progressBarWrapper: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 4,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  progressSubtext: {
    fontSize: 11,
    fontWeight: '500',
  },
  dateNavSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 14,
    gap: 20,
  },
  navArrowBtn: {
    padding: 8,
  },
  dateBadge: {
    width: 68,
    height: 64,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    position: 'relative',
  },
  dateNumber: {
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 26,
  },
  dateMonth: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  todayClockBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#2563EB',
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prayerLogCard: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
  },
  rowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  prayerName: {
    width: 80,
    fontSize: 15,
    fontWeight: '600',
  },
  sunnahSlot: {
    width: 44,
    alignItems: 'center',
  },
  sunnahBtn: {
    width: 36,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sunnahActive: {
    backgroundColor: '#059669',
    borderColor: '#10B981',
  },
  sunnahText: {
    fontSize: 13,
    fontWeight: '700',
  },
  sunnahTextActive: {
    color: '#FFFFFF',
  },
  essentialBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  essentialBtnDone: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  essentialBtnMissed: {
    backgroundColor: '#EF444420',
    borderColor: '#EF4444',
  },
  extraRakaaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 16,
    gap: 10,
  },
  extraRowTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  extraRowSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  extraInput: {
    width: 60,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    textAlign: 'center',
    fontWeight: '700',
  },
  addExtraBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#0284C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  latePrayersCard: {
    marginTop: 16,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
  },
  lateTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#EF4444',
    marginBottom: 8,
  },
  lateButtonsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  lateBadgeBtn: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  lateBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalBody: {
    gap: 10,
  },
  modalHelper: {
    fontSize: 13,
    marginBottom: 4,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  modalTextInput: {
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  modalPrimaryBtn: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  modalPrimaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  quickDateRow: {
    flexDirection: 'row',
    gap: 10,
  },
  quickDateBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
  },
  quickDateText: {
    fontWeight: '600',
  },
  importTextInput: {
    height: 100,
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    textAlignVertical: 'top',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
});