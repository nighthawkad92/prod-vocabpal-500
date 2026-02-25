import dictationDog from "@/assets/dictation/dog.svg";
import dictationGreen from "@/assets/dictation/green.svg";
import dictationProud from "@/assets/dictation/proud.svg";
import imageCatLottie from "@/assets/dictation/image-cat.lottie";
import imageQuestion1Lottie from "@/assets/dictation/image-question1.lottie";

export const TOTAL_QUESTION_COUNT = 10;

export type QuestionVisual = {
  src: string;
  kind: "image" | "lottie";
};

export const QUESTION_VISUAL_BY_ORDER: Record<number, QuestionVisual> = {
  1: { src: imageQuestion1Lottie, kind: "lottie" },
  2: { src: imageCatLottie, kind: "lottie" },
  4: { src: dictationDog, kind: "image" },
  6: { src: dictationGreen, kind: "image" },
  10: { src: dictationProud, kind: "image" },
};
