-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('Pre', 'InProgress', 'Done');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('USER', 'AI');

-- CreateTable
CREATE TABLE "Interview" (
    "id" TEXT NOT NULL,
    "githubMetadata" JSONB NOT NULL,
    "status" "InterviewStatus" NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Interview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" "MessageType" NOT NULL,
    "interviewID" TEXT NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_interviewID_fkey" FOREIGN KEY ("interviewID") REFERENCES "Interview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
