import { Text, View } from "react-native";

import Paper from "../../components/Paper";

export default function App() {
  return (
    <View className="flex-1 items-center justify-center bg-background px-5">
      <View className="flex h-full w-full items-center justify-center p-5">
        <View className="grid gap-4">
          <View className="flex flex-row justify-between">
            <Text>Tab 1</Text>
            <Text>Tab 2</Text>
          </View>
          <Paper>
            Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum
            has been the industry's standard dummy text ever since the early years, when an unknown
            printer took a galley of type and scrambled it to make a type specimen book. It has
            survived not only five centuries, but also the leap into electronic typesetting,
            remaining essentially unchanged.
          </Paper>
          <View className="flex flex-row justify-between">
            <Text>Prev</Text>
            <Text>Next</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
