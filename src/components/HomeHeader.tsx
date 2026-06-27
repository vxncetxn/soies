import { Text, View } from "react-native";
import { createNanoIconSet } from "react-native-nano-icons";

import glyphMap from "../../assets/nanoicons/icons.glyphmap.json";
import { formatDisplayDate } from "../utils/date";
import Button from "./Button";

const Icon = createNanoIconSet(glyphMap);

type HomeHeaderProps = {
  date: string;
};

const HomeHeader = ({ date }: HomeHeaderProps) => {
  return (
    <View className="absolute z-50 w-full px-5 py-2">
      <Button className="self-start">
        <View className="flex gap-1 px-6 py-2">
          <Text className="font-sans-medium text-xl text-primary">kiyomizudera</Text>
          <View className="flex flex-row items-center gap-2">
            <Text className="font-mono text-base text-secondary">{formatDisplayDate(date)}</Text>
            <Icon name="chevron-down" size={20} color="#79716B" />
          </View>
        </View>
      </Button>
    </View>
  );
};

export default HomeHeader;
