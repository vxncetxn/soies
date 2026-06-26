import { Text, View } from "react-native";

import Paper from "../../components/Paper";
import Stack from "../../components/Stack";

export default function App() {
  return (
    <View className="flex-1 items-center justify-center bg-background px-5">
      <View className="flex h-full w-full items-center justify-center p-5">
        <View className="grid gap-4">
          <View className="flex flex-row justify-between">
            <Text>Tab 1</Text>
            <Text>Tab 2</Text>
          </View>
          <Stack
            cards={Array.from({ length: 5 }).map((_, index) => (
              <Paper key={index}>Lorem {index}</Paper>
            ))}
          ></Stack>
          <View className="flex flex-row justify-between">
            <Text>Prev</Text>
            <Text>Next</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
