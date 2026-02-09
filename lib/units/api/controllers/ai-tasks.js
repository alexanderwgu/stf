/**
* Copyright © 2026 contains code contributed by Orange SA, authors: Denis Barbaron - Licensed under the Apache license 2.0
**/

const apiutil = require('../../../util/apiutil')
const dbapi = require('../../../db/api')

function listAiTasks(req, res) {
  dbapi.getAiTasks().then(function(tasks) {
    apiutil.respond(res, 200, 'AI tasks list', {
      aiTasks: tasks
    })
  })
  .catch(function(err) {
    apiutil.internalError(res, 'Failed to load AI tasks: ', err.stack)
  })
}

function listAiTasksByDevice(req, res) {
  const serial = req.swagger.params.serial.value
  dbapi.getAiTasksBySerial(serial).then(function(tasks) {
    apiutil.respond(res, 200, 'AI tasks list', {
      aiTasks: tasks
    })
  })
  .catch(function(err) {
    apiutil.internalError(res, 'Failed to load AI tasks: ', err.stack)
  })
}

function createAiTask(req, res) {
  const serial = req.swagger.params.serial.value
  const prompt = apiutil.getBodyParameter(req.body, 'prompt')

  if (!prompt || !prompt.trim()) {
    return apiutil.respond(res, 400, 'Bad Request (prompt required)')
  }

  return dbapi.getAiTasksBySerial(serial).then(function(tasks) {
    const running = tasks.find(function(task) {
      return task.status === 'running' || task.status === 'queued'
    })
    if (running) {
      return apiutil.respond(res, 409, 'Conflict (AI task already running)')
    }

    return dbapi.createAiTask({
      serial: serial
    , prompt: prompt.trim()
    , status: 'queued'
    , createdBy: {
        email: req.user.email
      , name: req.user.name
      }
    })
    .then(function(task) {
      apiutil.respond(res, 200, 'AI task created', {
        aiTask: task
      })
    })
  })
  .catch(function(err) {
    apiutil.internalError(res, 'Failed to create AI task: ', err.stack)
  })
}

function cancelAiTask(req, res) {
  const id = req.swagger.params.id.value

  return dbapi.getAiTask(id).then(function(task) {
    if (!task) {
      return apiutil.respond(res, 404, 'Not Found (AI task)')
    }

    if (task.status === 'completed' || task.status === 'failed') {
      return apiutil.respond(res, 409, 'Conflict (AI task already finished)')
    }

    return dbapi.updateAiTask(id, {status: 'cancelled'})
      .then(function(updated) {
        apiutil.respond(res, 200, 'AI task cancelled', {
          aiTask: updated
        })
      })
  })
  .catch(function(err) {
    apiutil.internalError(res, 'Failed to cancel AI task: ', err.stack)
  })
}

module.exports = {
  listAiTasks: listAiTasks
, listAiTasksByDevice: listAiTasksByDevice
, createAiTask: createAiTask
, cancelAiTask: cancelAiTask
}
