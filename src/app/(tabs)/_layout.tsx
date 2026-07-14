import { TabList, TabSlot, Tabs, TabTrigger } from "expo-router/ui";

import { CreateProvider } from "../../components/CreateContext";
import CreateEntryButton from "../../components/CreateEntryButton";
import CreateOverlay from "../../components/CreateOverlay";
import { ExpandProvider } from "../../components/ExpandContext";
import { Icon } from "../../components/Icon";
import StyledTabList from "../../components/tabs/StyledTabList";
import StyledTabTrigger from "../../components/tabs/StyledTabTrigger";

export default function Layout() {
  return (
    <ExpandProvider>
      <CreateProvider>
        {/* `relative` makes the Tabs container the positioning context for its
            absolute children — the tab bar (StyledTabList, bottom-4 centred) and
            the CreateEntryButton (bottom-5 right-5) share this coordinate space
            so they sit on the same horizontal line. Default TabSlot lifecycle is
            intentionally lazy: Gallery must not allocate queries, images, and
            frame trees during Home cold start. */}
        <Tabs className="relative">
          <TabSlot />
          <TabList asChild>
            <StyledTabList>
              <TabTrigger name="home" href="/" resetOnFocus={false} asChild>
                <StyledTabTrigger>
                  <Icon name="home" size={24} color="#79716B" />
                </StyledTabTrigger>
              </TabTrigger>
              <TabTrigger name="gallery" href="/gallery" asChild>
                <StyledTabTrigger>
                  <Icon name="photo" size={24} color="#79716B" />
                </StyledTabTrigger>
              </TabTrigger>
            </StyledTabList>
          </TabList>
          {/* Floating create-entry button. Rendered after TabList so it stacks
                above it; its bloom panel is portaled to the root `bloom` host, so
                it floats above the whole app when open. expo-router's Tabs ignores
                non-TabTrigger children when parsing triggers, so this is safe. */}
          <CreateEntryButton />
        </Tabs>
        <CreateOverlay />
      </CreateProvider>
    </ExpandProvider>
  );
}
