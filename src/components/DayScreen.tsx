import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { getEntriesByDate } from "../data/entries";
import { formatDisplayDate, todayISO } from "../utils/date";
import DayPager from "./DayPager";

type DayScreenProps = {
  date: string;
};

const DayScreen = ({ date }: DayScreenProps) => {
  const entries = getEntriesByDate(date);
  const isToday = date === todayISO();

  return (
    <View className="relative flex-1 bg-background">
      <View
        className="absolute left-5 right-5 top-4 z-10 flex flex-row items-center justify-between"
        pointerEvents="box-none"
      >
        <Text className="font-paper text-lg text-primary">{formatDisplayDate(date)}</Text>
        {!isToday && (
          <Pressable onPress={() => router.setParams({ date: todayISO() })}>
            <Text className="text-primary">Today</Text>
          </Pressable>
        )}
      </View>

      {entries.length === 0 ? (
        <View className="flex-1 items-center justify-center px-5">
          <Text className="text-center text-primary">No entries for this day.</Text>
        </View>
      ) : (
        <DayPager entries={entries} />
      )}
    </View>
  );
};

export default DayScreen;
