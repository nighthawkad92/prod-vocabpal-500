import imageCatLottie from "@/assets/dictation/image-cat.lottie";
import imageDogLottie from "@/assets/dictation/image-dog.lottie";
import imageQuestion1Lottie from "@/assets/dictation/image-question1.lottie";

export const TOTAL_QUESTION_COUNT = 10;

export type QuestionVisual = {
  src: string;
  kind: "image" | "lottie";
};

export const QUESTION_VISUAL_BY_ORDER: Record<number, QuestionVisual> = {
  1: { src: imageQuestion1Lottie, kind: "lottie" },
  2: { src: imageCatLottie, kind: "lottie" },
  4: { src: imageDogLottie, kind: "lottie" },
};
