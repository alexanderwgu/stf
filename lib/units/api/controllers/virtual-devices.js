/**
* Copyright © 2026 contains code contributed by Orange SA, authors: Denis Barbaron - Licensed under the Apache license 2.0
**/

const Promise = require('bluebird')
const uuid = require('uuid')
const _ = require('lodash')

const apiutil = require('../../../util/apiutil')
const dbapi = require('../../../db/api')

function ensureVirtualDevice(res, id) {
  return dbapi.getVirtualDevice(id).then(function(device) {
    if (!device) {
      apiutil.respond(res, 404, 'Not Found (virtual device)')
      return null
    }
    return device
  })
}

function listVirtualDevices(req, res) {
  dbapi.getVirtualDevices().then(function(devices) {
    apiutil.respond(res, 200, 'Virtual devices list', {
      virtualDevices: devices
    })
  })
  .catch(function(err) {
    apiutil.internalError(res, 'Failed to load virtual devices: ', err.stack)
  })
}

function createVirtualDevices(req, res) {
  const name = apiutil.getBodyParameter(req.body, 'name')
  const count = Number(apiutil.getBodyParameter(req.body, 'count') || 1)
  const maxCount = 10

  if (Number.isNaN(count) || count < 1 || count > maxCount) {
    return apiutil.respond(res, 400, 'Bad Request (invalid count)')
  }

  const baseName = name && name.trim().length ? name.trim() : 'Virtual Device'

  return Promise.map(_.range(count), function(index) {
    const suffix = count > 1 ? ` ${index + 1}` : ''
    const actionId = uuid.v4()
    return dbapi.createVirtualDevice({
      name: `${baseName}${suffix}`
    , status: 'creating'
    , requestedAction: 'create'
    , requestedActionId: actionId
    , createdBy: {
        email: req.user.email
      , name: req.user.name
      }
    })
  })
  .then(function(created) {
    apiutil.respond(res, 200, 'Virtual devices created', {
      virtualDevices: created
    })
  })
  .catch(function(err) {
    apiutil.internalError(res, 'Failed to create virtual devices: ', err.stack)
  })
}

function startVirtualDevice(req, res) {
  const id = req.swagger.params.id.value
  ensureVirtualDevice(res, id).then(function(device) {
    if (!device) {
      return
    }
    if (device.status === 'running' || device.status === 'starting' || device.status === 'creating') {
      return apiutil.respond(res, 409, 'Conflict (virtual device already running)')
    }
    return dbapi.updateVirtualDevice(id, {
      requestedAction: 'start'
    , requestedActionId: uuid.v4()
    , status: 'starting'
    })
    .then(function(updated) {
      apiutil.respond(res, 200, 'Virtual device start requested', {
        virtualDevice: updated
      })
    })
  })
  .catch(function(err) {
    apiutil.internalError(res, 'Failed to start virtual device: ', err.stack)
  })
}

function stopVirtualDevice(req, res) {
  const id = req.swagger.params.id.value
  ensureVirtualDevice(res, id).then(function(device) {
    if (!device) {
      return
    }
    if (device.status === 'stopped' || device.status === 'stopping' || device.status === 'creating') {
      return apiutil.respond(res, 409, 'Conflict (virtual device already stopped)')
    }
    return dbapi.updateVirtualDevice(id, {
      requestedAction: 'stop'
    , requestedActionId: uuid.v4()
    , status: 'stopping'
    })
    .then(function(updated) {
      apiutil.respond(res, 200, 'Virtual device stop requested', {
        virtualDevice: updated
      })
    })
  })
  .catch(function(err) {
    apiutil.internalError(res, 'Failed to stop virtual device: ', err.stack)
  })
}

function deleteVirtualDevice(req, res) {
  const id = req.swagger.params.id.value
  ensureVirtualDevice(res, id).then(function(device) {
    if (!device) {
      return
    }
    return dbapi.updateVirtualDevice(id, {
      requestedAction: 'delete'
    , requestedActionId: uuid.v4()
    , status: 'deleting'
    })
    .then(function(updated) {
      apiutil.respond(res, 200, 'Virtual device delete requested', {
        virtualDevice: updated
      })
    })
  })
  .catch(function(err) {
    apiutil.internalError(res, 'Failed to delete virtual device: ', err.stack)
  })
}

module.exports = {
  listVirtualDevices: listVirtualDevices
, createVirtualDevices: createVirtualDevices
, startVirtualDevice: startVirtualDevice
, stopVirtualDevice: stopVirtualDevice
, deleteVirtualDevice: deleteVirtualDevice
}
