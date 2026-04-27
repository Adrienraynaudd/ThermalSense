-- CreateTable
CREATE TABLE "ActuatorCommand" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "command" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actuatorId" TEXT NOT NULL,
    CONSTRAINT "ActuatorCommand_actuatorId_fkey" FOREIGN KEY ("actuatorId") REFERENCES "Actuator" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
