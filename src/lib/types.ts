export type WorkTag = "it-job" | "job" | "other";

export type ChannelInfo = {
  username: string;
  title: string;
  description: string;
  avatar: string | null;
  subscribers: string | null;
  photos: string | null;
  links: string | null;
};

export type TelegramPost = {
  id: number;
  channel: string;
  url: string;
  text: string;
  html: string;
  date: string | null;
  dateLabel: string | null;
  views: string | null;
  photos: string[];
  hasVideo: boolean;
  tag: WorkTag;
  score: number;
  matchedKeywords: string[];
};

export type PostsResponse = {
  channel: ChannelInfo;
  posts: TelegramPost[];
  nextBefore: number | null;
  fetched: number;
};
