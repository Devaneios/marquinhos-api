export interface IUserAuth extends mongoose.Document {
  discordId: string;
  lastfmToken?: string;
  scrobblesOn: boolean;
}
