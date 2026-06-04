import { StatusBar } from "expo-status-bar";
import { Text, View } from "react-native";

export default function App() {
  return (
    <View className="flex-1 items-center justify-center bg-background px-8">
      {/* Heading */}
      <Text className="mb-3 text-4xl font-extrabold tracking-tight text-primary">🚀 Welcome</Text>

      {/* Subheading */}
      <Text className="mb-8 text-center text-xl leading-relaxed text-secondary">
        Build beautiful apps with{" "}
        <Text className="font-semibold text-blue-500">Expo (Router) + Uniwind 🔥</Text>
      </Text>

      {/* Instruction text */}
      <Text className="max-w-sm text-center text-base text-primary">
        Start customizing your app by editing <Text className="font-semibold">app/index.tsx</Text>
      </Text>

      <StatusBar style="dark" />
    </View>
  );
}
