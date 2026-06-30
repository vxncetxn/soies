import { TabList, Tabs, TabSlot, TabTrigger } from "expo-router/ui";

import { ExpandProvider } from "../../components/ExpandContext";
import { Icon } from "../../components/Icon";
import StyledTabList from "../../components/tabs/StyledTabList";
import StyledTabTrigger from "../../components/tabs/StyledTabTrigger";

export default function Layout() {
  return (
    <ExpandProvider>
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
      </Tabs>
    </ExpandProvider>
  );
}
