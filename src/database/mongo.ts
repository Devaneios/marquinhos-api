import mongoose from 'mongoose';

export const mongoConnection = async () => {
  const MONGO_URI = process.env.MONGO_URI;
  const MONGO_DATABASE_NAME = process.env.MONGO_DATABASE_NAME;
  if (!MONGO_URI) throw new Error(`Mongo URI not found`);
  if (!MONGO_DATABASE_NAME) throw new Error(`Mongo database name not found`);
  return await mongoose
    .connect(`${MONGO_URI}/${MONGO_DATABASE_NAME}`)
    .then(() => console.log('MongoDB connection has been established.'))
    .catch((error) => {
      console.error('MongoDB connection has been failed');
      console.error(error);
      throw new Error(error);
    });
};
