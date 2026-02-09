module.exports = function AiTasksServiceFactory($http) {
  const AiTasksService = {}

  AiTasksService.listByDevice = function(serial) {
    return $http.get('/api/v1/ai/devices/' + serial + '/tasks')
  }

  AiTasksService.create = function(serial, prompt) {
    return $http.post('/api/v1/ai/devices/' + serial + '/tasks', {
      prompt: prompt
    })
  }

  AiTasksService.cancel = function(id) {
    return $http.delete('/api/v1/ai/tasks/' + id)
  }

  return AiTasksService
}
