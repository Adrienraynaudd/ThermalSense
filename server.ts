import express from 'express';
import * as buildingController from './controllers/building.controller';
import * as zoneController from './controllers/zone.controller';
import * as sensorController from './controllers/sensor.controller';
import * as measurementController from './controllers/measurement.controller';
import * as actuatorController from './controllers/actuator.controller';
import * as alertThresholdController from './controllers/alertThreshold.controller';
import * as actuatorCommandController from './controllers/actuatorCommand.controller';
import * as authController from './controllers/auth.controller';
import { authenticateToken } from './middlewares/auth.middleware';
import { attachRequestId } from './middlewares/requestContext.middleware';
import {
  authLoginRateLimiter,
  authRefreshRateLimiter,
  criticalWriteRateLimiter,
} from './middlewares/rateLimit.middleware';
import swaggerSpec from './swagger';

const swaggerUi = require('swagger-ui-express');

const app = express();
app.use(attachRequestId);
app.use(express.json());

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.post('/auth/login', authLoginRateLimiter, authController.login);
app.post('/auth/refresh', authRefreshRateLimiter, authController.refresh);

app.use(authenticateToken);

app.post('/auth/register', criticalWriteRateLimiter, authController.register);
app.get('/auth/me', authController.me);

app.get('/building', buildingController.getAll);
app.post('/building', buildingController.create);
app.get('/building/:id', buildingController.getById);
app.patch('/building/:id', buildingController.update);
app.delete('/building/:id', buildingController.remove);

app.get('/zone', zoneController.getAll);
app.post('/building/:id/zone', zoneController.create);
app.get('/zone/:id', zoneController.getById);
app.patch('/zone/:id', zoneController.update);
app.delete('/zone/:id', zoneController.remove);

app.get('/sensor', sensorController.getAll);
app.get('/sensors', sensorController.getAll);
app.post('/sensors', criticalWriteRateLimiter, sensorController.createFromBody);
app.post('/zone/:id/sensor', criticalWriteRateLimiter, sensorController.create);
app.get('/sensor/:id', sensorController.getById);
app.get('/sensors/:id', sensorController.getById);
app.delete('/sensors/:id', criticalWriteRateLimiter, sensorController.remove);
app.get('/sensors/:id/config', sensorController.getConfig);
app.patch('/sensors/:id/config', criticalWriteRateLimiter, sensorController.updateConfig);
app.patch('/sensor/:id', sensorController.update);
app.delete('/sensor/:id', sensorController.remove);

app.get('/measurement', measurementController.getAll);
app.post('/sensor/:id/measurement', criticalWriteRateLimiter, measurementController.create);
app.post('/sensors/:id/measurement', criticalWriteRateLimiter, measurementController.create);

app.get('/actuator', actuatorController.getAll);
app.get('/actuators', actuatorController.getAll);
app.post('/zone/:id/actuator', criticalWriteRateLimiter, actuatorController.create);
app.get('/actuator/:id', actuatorController.getById);
app.get('/actuators/:id/commands', actuatorController.getCommands);
app.post('/actuators/:id/commands', criticalWriteRateLimiter, actuatorController.createCommand);
app.patch('/actuator/:id', actuatorController.update);
app.delete('/actuator/:id', actuatorController.remove);

app.get('/actuator/:id/commands', actuatorCommandController.getAll);
app.post('/actuator/:id/command', actuatorCommandController.create);
app.post('/actuator/:id/commands', actuatorCommandController.send);
app.get('/actuator-command/:id', actuatorCommandController.getById);
app.patch('/actuator-command/:id', actuatorCommandController.update);
app.delete('/actuator-command/:id', actuatorCommandController.remove);

app.get('/alert-threshold', alertThresholdController.getAll);
app.post('/zone/:id/alert-threshold', criticalWriteRateLimiter, alertThresholdController.create);
app.patch('/alert-threshold/:id', criticalWriteRateLimiter, alertThresholdController.update);
app.delete('/alert-threshold/:id', criticalWriteRateLimiter, alertThresholdController.remove);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(` http://localhost:${PORT}`);
});
