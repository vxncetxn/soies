# soies

A personal journal built with Expo 57 and React Native. Dated Entries contain
text Papers or image Prints and can be browsed, authored, shared, and featured
in an iOS Home Screen Widget.

## Styling

[React Native Unistyles 3](https://www.unistyl.es/v3/start/introduction/) is the
only app-owned styling system. `src/styles/themes.ts` defines semantic adaptive
Chrome tokens and follows the device light/dark appearance automatically.
`src/styles/tokens.ts` owns fixed Artefact, capture, Share, Frame, Ink, Widget,
and bootstrap values that must not change with device appearance.

[React Native Boost](https://react-native-boost.oss.kuatsu.de/docs) optimizes
safe native `Text` and `View` hosts in explicit Unistyles mode. Its conservative
bailouts remain enabled. Unavoidable native and serialized mirrors are tracked
in [`docs/styling-token-exceptions.md`](./docs/styling-token-exceptions.md).

## Development

```sh
pnpm install
pnpm start -- --clear
pnpm check
pnpm exec expo export --platform ios --clear
```

Unistyles contains native code, so Expo Go is not supported. After changing
native dependencies or app configuration, regenerate/rebuild the development
client with `pnpm ios` or `pnpm android`.

Read [`docs/README.md`](./docs/README.md) for feature documentation and
[`docs/overview.md`](./docs/overview.md) for the repository map.
