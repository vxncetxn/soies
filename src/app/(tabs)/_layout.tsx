import { TabList, Tabs, TabSlot, TabTrigger } from "expo-router/ui";
import { createNanoIconSet } from "react-native-nano-icons";

import glyphMap from "../../../assets/nanoicons/icons.glyphmap.json";
import StyledTabList from "../../components/tabs/StyledTabList";
import StyledTabTrigger from "../../components/tabs/StyledTabTrigger";

const Icon = createNanoIconSet(glyphMap);

export default function Layout() {
  return (
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
              <Icon name="frame" size={24} color="#79716B" />
            </StyledTabTrigger>
          </TabTrigger>
        </StyledTabList>
      </TabList>
    </Tabs>
  );
}
