import { useState, PropsWithChildren } from "react";
import { Pressable } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Portal } from "react-native-teleport";
import { withUniwind } from "uniwind";

const StyledPortal = withUniwind(Portal);

const Artefact = ({ children }: PropsWithChildren) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <>
      <Pressable onPress={() => setIsExpanded(true)}>
        <Animated.View
          className="aspect-a4 max-h-[calc((100vw-80px)/210*297)] w-[calc(100vw-80px)]"
          entering={FadeIn.duration(250)}
          exiting={FadeOut.duration(250)}
        >
          {children}
        </Animated.View>
      </Pressable>
      {isExpanded && (
        <StyledPortal hostName={"overlay"} className="items-center justify-center">
          <Pressable onPress={() => setIsExpanded(false)}>
            <Animated.View
              className="aspect-a4 max-h-[calc((100vw-20px)/210*297)] w-[calc(100vw-20px)]"
              entering={FadeIn.duration(250)}
              exiting={FadeOut.duration(250)}
            >
              {children}
            </Animated.View>
          </Pressable>
        </StyledPortal>
      )}
    </>
  );
};

export default Artefact;
