export interface IUserAuth extends mongoose.Document {
  discordId: string;
  discordToken: string;
  discordTokenExpiresAt: Date;
  lastfmToken: string;
  scrobblesOn: boolean;
}
