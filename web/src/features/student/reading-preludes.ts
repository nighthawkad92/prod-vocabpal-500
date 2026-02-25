import question3SentenceImage from "@/assets/sentences/image-question3-sentence.png";
import question4SentenceImage from "@/assets/sentences/image-question4-sentence.png";
import question5SentenceImage from "@/assets/sentences/image-question5-sentence.png";

export type QuestionReadingPrelude = {
  imageSrc: string;
  sentence: string;
  questionPrompt: string;
};

export const QUESTION_READING_PRELUDE_BY_ORDER: Record<number, QuestionReadingPrelude> = {
  5: {
    imageSrc: question3SentenceImage,
    sentence: "Rita has a red bag.",
    questionPrompt: "What color is the bag?",
  },
  7: {
    imageSrc: question4SentenceImage,
    sentence: "Tom has a small dog. The dog likes to play in the park.",
    questionPrompt: "Where does the dog like to play?",
  },
  9: {
    imageSrc: question5SentenceImage,
    sentence:
      "Meena studied hard for her test. She wanted to make her parents proud. On Monday, she smiled when she saw her marks.",
    questionPrompt: "Why did Meena smile?",
  },
};
