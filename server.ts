import express from 'express';
import * as buildingController from './controllers/building.controller';
import * as zoneController from './controllers/zone.controller';
import * as sensorController from './controllers/sensor.controller';
import * as measurementController from './controllers/measurement.controller';
import * as actuatorController from './controllers/actuator.controller';
import * as alertThresholdController from './controllers/alertThreshold.controller';
import swaggerSpec from './swagger';

const swaggerUi = require('swagger-ui-express');

const app = express();
app.use(express.json());

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

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
app.post('/zone/:id/sensor', sensorController.create);
app.get('/sensor/:id', sensorController.getById);
app.patch('/sensor/:id', sensorController.update);
app.delete('/sensor/:id', sensorController.remove);

app.get('/measurement', measurementController.getAll);
app.post('/sensor/:id/measurement', measurementController.create);

app.get('/actuator', actuatorController.getAll);
app.post('/zone/:id/actuator', actuatorController.create);
app.get('/actuator/:id', actuatorController.getById);
app.patch('/actuator/:id', actuatorController.update);
app.delete('/actuator/:id', actuatorController.remove);

app.get('/alert-threshold', alertThresholdController.getAll);
app.post('/zone/:id/alert-threshold', alertThresholdController.create);
app.patch('/alert-threshold/:id', alertThresholdController.update);
app.delete('/alert-threshold/:id', alertThresholdController.remove);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(` http://localhost:${PORT}`);
});
