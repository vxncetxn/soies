import { TabList, Tabs, TabSlot, TabTrigger } from "expo-router/ui";

import IconFrame from "../../components/icons/IconFrame";
import IconHome from "../../components/icons/IconHome";
import StyledTabList from "../../components/tabs/StyledTabList";
import StyledTabTrigger from "../../components/tabs/StyledTabTrigger";

export default function Layout() {
  return (
    <Tabs>
      <TabSlot />
      <TabList asChild>
        <StyledTabList>
          <TabTrigger name="home" href="/" asChild>
            <StyledTabTrigger>
              <IconHome />
            </StyledTabTrigger>
          </TabTrigger>
          <TabTrigger name="gallery" href="/gallery" asChild>
            <StyledTabTrigger>
              <IconFrame />
            </StyledTabTrigger>
          </TabTrigger>
        </StyledTabList>
      </TabList>
    </Tabs>
  );
}
