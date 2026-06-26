import { useLocalSearchParams } from "expo-router";

import DayScreen from "../../components/DayScreen";
import { todayISO } from "../../utils/date";

export default function Index() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  const effectiveDate = date ?? todayISO();

  return <DayScreen key={effectiveDate} date={effectiveDate} />;
}
