module.exports = function VirtualDevicesServiceFactory($http) {
  const VirtualDevicesService = {}

  VirtualDevicesService.list = function() {
    return $http.get('/api/v1/virtual-devices')
  }

  VirtualDevicesService.create = function(name, count) {
    const payload = {
      count: count
    }
    if (name) {
      payload.name = name
    }
    return $http.post('/api/v1/virtual-devices', payload)
  }

  VirtualDevicesService.start = function(id) {
    return $http.post('/api/v1/virtual-devices/' + id + '/start')
  }

  VirtualDevicesService.stop = function(id) {
    return $http.post('/api/v1/virtual-devices/' + id + '/stop')
  }

  VirtualDevicesService.delete = function(id) {
    return $http.delete('/api/v1/virtual-devices/' + id)
  }

  return VirtualDevicesService
}
