// interfaces/transition-result.interface.ts

import { Stage } from "../stage.entity";
import { Transition } from "../transition.entity";

export interface TransitionResult {
  success: boolean;
  fromStage: Stage;
  toStage: Stage;
  transition: Transition;
  error?: string;
}