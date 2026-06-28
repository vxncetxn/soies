import { useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";

import DayPager from "../../components/DayPager";
import HomeHeader from "../../components/HomeHeader";
import { getEntriesByDate } from "../../data/entries";
import { todayISO } from "../../utils/date";

export default function Index() {
  const { date } = useLocalSearchParams<{ date?: string }>();

  const effectiveDate = date ?? todayISO();
  const entries = getEntriesByDate(effectiveDate);
  // const isToday = date === todayISO();

  return (
    <View className="relative flex-1 bg-background">
      <HomeHeader date={effectiveDate} />

      {entries.length === 0 ? (
        <View className="flex-1 items-center justify-center px-5">
          <Text className="text-center text-primary">No entries for this day.</Text>
        </View>
      ) : (
        <DayPager key={effectiveDate} entries={entries} />
      )}
    </View>
  );
}
