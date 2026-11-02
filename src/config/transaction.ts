import mongoose from 'mongoose';

export const withTransaction = async <T>(
  handler: (session: mongoose.ClientSession) => Promise<T>,
) => {
  const session = await mongoose.startSession();

  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await handler(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
};
