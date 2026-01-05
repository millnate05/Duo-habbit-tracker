export type UserId = string;

export type Habit = {
  id: string;
  title: string;
  createdAt: number;
};

export type HabitLog = {
  id: string;
  habitId: string;
  userId: UserId;
  timestamp: number;
  note?: string;
};
