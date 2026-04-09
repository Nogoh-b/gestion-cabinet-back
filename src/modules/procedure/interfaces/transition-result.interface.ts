// interfaces/transition-result.interface.ts
import { Stage } from '../entities/stage.entity';
import { Transition } from '../entities/transition.entity';

export interface TransitionResult {
  success: boolean;
  fromStage: Stage;
  toStage: Stage;
  transition: Transition;
  error?: string;
}