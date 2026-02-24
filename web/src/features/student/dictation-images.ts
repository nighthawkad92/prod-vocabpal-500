import dictationCat from "@/assets/dictation/cat.svg";
import dictationDog from "@/assets/dictation/dog.svg";
import dictationGreen from "@/assets/dictation/green.svg";
import dictationHappy from "@/assets/dictation/happy.svg";
import dictationProud from "@/assets/dictation/proud.svg";

export const TOTAL_QUESTION_COUNT = 10;

export const DICTATION_IMAGE_BY_ORDER: Record<number, string> = {
  2: dictationCat,
  4: dictationDog,
  6: dictationGreen,
  8: dictationHappy,
  10: dictationProud,
};
