const firebaseProjectId =
  process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "";

const authConfig = {
  providers: [
    {
      domain: firebaseProjectId ? `https://securetoken.google.com/${firebaseProjectId}` : "",
      applicationID: firebaseProjectId,
    },
  ],
};

export default authConfig;
