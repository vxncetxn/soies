import type { ImageSource } from "expo-image";

import { addDaysISO, todayISO } from "../utils/date";

export type PaperArtefact = {
  text: string;
};

export type PrintArtefact = {
  text: string;
  img: ImageSource | number;
};

export type Artefact = PaperArtefact | PrintArtefact;

export type PaperEntry = {
  title: string;
  type: "paper";
  artefacts: PaperArtefact[];
};

export type PrintEntry = {
  title: string;
  type: "print";
  artefacts: PrintArtefact[];
};

export type Entry = PaperEntry | PrintEntry;

export type DayEntries = {
  date: string;
  entries: Entry[];
};

const MOCK_DATA: DayEntries[] = [
  {
    date: todayISO(),
    entries: [
      {
        title: "An example entry",
        type: "paper",
        artefacts: [
          {
            text: "Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since 1966, when designers at Letraset and James Mosley, the librarian at St Bride Printing Library in London, took a 1914 Cicero translation and scrambled it to make dummy text for Letraset's Body Type sheets.",
          },
          { text: "Paper 2" },
          { text: "Paper 3" },
          { text: "Paper 4" },
          { text: "Paper 5" },
        ],
      },
      {
        title: "kiyomizudera",
        type: "print",
        artefacts: [{ text: "Print 1", img: require("./mock-image.png") }],
      },
    ],
  },
  {
    date: addDaysISO(todayISO(), -1),
    entries: [
      {
        title: "day in retro",
        type: "paper",
        artefacts: [{ text: "Paper 1" }, { text: "Paper 2" }],
      },
    ],
  },
];

export const getEntriesByDate = (date: string): Entry[] => {
  // Use .find() to get the specific day object
  const day = MOCK_DATA.find((d) => d.date === date);

  // Return the entries if found, otherwise an empty array
  return day ? day.entries : [];
};

export const getEntryDates = (): Set<string> => new Set(MOCK_DATA.map((d) => d.date));
