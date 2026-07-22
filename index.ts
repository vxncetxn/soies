// Unistyles parses stylesheets as modules load, so its themes must exist before
// Expo Router imports the route tree on native and web.
import "./src/styles/unistyles";
import "expo-router/entry";
