/**
* Copyright © 2019 contains code contributed by Orange SA, authors: Denis Barbaron - Licensed under the Apache license 2.0
**/

var QueryParser = require('./util/query-parser')

module.exports = function DeviceListCtrl(
  $scope
, DeviceService
, DeviceColumnService
, GroupService
, ControlService
, SettingsService
, CommonService
, VirtualDevicesService
, $uibModal
, $interval
, $location
) {
  $scope.tracker = DeviceService.trackAll($scope)
  $scope.control = ControlService.create($scope.tracker.devices, '*ALL')

  $scope.columnDefinitions = DeviceColumnService

  var defaultColumns = [
    {
      name: 'state'
    , selected: true
    }
  , {
      name: 'model'
    , selected: true
    }
  , {
      name: 'name'
    , selected: true
    }
  , {
      name: 'serial'
    , selected: false
    }
  , {
      name: 'operator'
    , selected: true
    }
  , {
      name: 'releasedAt'
    , selected: true
    }
  , {
      name: 'version'
    , selected: true
    }
  , {
      name: 'network'
    , selected: false
    }
  , {
      name: 'display'
    , selected: false
    }
  , {
      name: 'manufacturer'
    , selected: false
    }
  , {
      name: 'marketName'
    , selected: false
    }
  , {
      name: 'sdk'
    , selected: false
    }
  , {
      name: 'abi'
    , selected: false
    }
  , {
      name: 'cpuPlatform'
    , selected: false
    }
  , {
      name: 'openGLESVersion'
    , selected: false
    }
  , {
      name: 'browser'
    , selected: false
    }
  , {
      name: 'phone'
    , selected: false
    }
  , {
      name: 'imei'
    , selected: false
    }
  , {
      name: 'imsi'
    , selected: false
    }
  , {
      name: 'iccid'
    , selected: false
    }
  , {
      name: 'batteryHealth'
    , selected: false
    }
  , {
      name: 'batterySource'
    , selected: false
    }
  , {
      name: 'batteryStatus'
    , selected: false
    }
  , {
      name: 'batteryLevel'
    , selected: false
    }
  , {
      name: 'batteryTemp'
    , selected: false
    }
  , {
      name: 'provider'
    , selected: true
    }
  , {
      name: 'notes'
    , selected: true
    }
  , {
      name: 'owner'
    , selected: true
    }
  , {
      name: 'group'
    , selected: false
    }
  , {
      name: 'groupSchedule'
    , selected: false
    }
  , {
      name: 'groupStartTime'
    , selected: false
    }
  , {
      name: 'groupEndTime'
    , selected: false
    }
  , {
      name: 'groupRepetitions'
    , selected: false
    }
  , {
      name: 'groupOwner'
    , selected: false
    }
  , {
      name: 'groupOrigin'
    , selected: false
    }
  ]

  $scope.columns = defaultColumns

  SettingsService.bind($scope, {
    target: 'columns'
  , source: 'deviceListColumns'
  })

  var defaultSort = {
    fixed: [
      {
        name: 'state'
        , order: 'asc'
      }
    ]
    , user: [
      {
        name: 'name'
        , order: 'asc'
      }
    ]
  }

  $scope.sort = defaultSort

  SettingsService.bind($scope, {
    target: 'sort'
  , source: 'deviceListSort'
  })

  $scope.filter = []

  $scope.activeTabs = {
    icons: true
  , details: false
  }

  SettingsService.bind($scope, {
    target: 'activeTabs'
  , source: 'deviceListActiveTabs'
  })

  $scope.toggle = function(device) {
    if (device.using) {
      $scope.kick(device)
    } else {
      $location.path('/control/' + device.serial)
    }
  }

  $scope.invite = function(device) {
    return GroupService.invite(device).then(function() {
      $scope.$digest()
    })
  }

  $scope.applyFilter = function(query) {
    $scope.filter = QueryParser.parse(query)
  }

  $scope.search = {
    deviceFilter: '',
    focusElement: false
  }

  $scope.focusSearch = function() {
    if (!$scope.basicMode) {
      $scope.search.focusElement = true
    }
  }

  $scope.reset = function() {
    $scope.search.deviceFilter = ''
    $scope.filter = []
    $scope.sort = defaultSort
    $scope.columns = defaultColumns
  }

  $scope.virtualDevices = []
  $scope.virtualDevicesLoading = true

  function refreshVirtualDevices() {
    $scope.virtualDevicesLoading = true
    return CommonService.errorWrapper(VirtualDevicesService.list, [])
      .then(function(response) {
        if (response && response.data && response.data.virtualDevices) {
          $scope.virtualDevices = response.data.virtualDevices
        }
      })
      .finally(function() {
        $scope.virtualDevicesLoading = false
      })
  }

  $scope.openVirtualDeviceModal = function() {
    var modalInstance = $uibModal.open({
      template: require('./virtual-device-create-modal.pug')
    , controller: function($scope, $uibModalInstance) {
        $scope.modal = {
          name: ''
        , count: 1
        }

        $scope.ok = function() {
          $uibModalInstance.close($scope.modal)
        }

        $scope.cancel = function() {
          $uibModalInstance.dismiss('cancel')
        }
      }
    })

    modalInstance.result.then(function(values) {
      var count = Math.max(1, Number(values.count) || 1)
      CommonService.errorWrapper(VirtualDevicesService.create, [
        values.name
      , count
      ])
      .then(refreshVirtualDevices)
    })
  }

  $scope.startVirtualDevice = function(device) {
    CommonService.errorWrapper(VirtualDevicesService.start, [device.id])
      .then(refreshVirtualDevices)
  }

  $scope.stopVirtualDevice = function(device) {
    CommonService.errorWrapper(VirtualDevicesService.stop, [device.id])
      .then(refreshVirtualDevices)
  }

  $scope.deleteVirtualDevice = function(device) {
    CommonService.errorWrapper(VirtualDevicesService.delete, [device.id])
      .then(refreshVirtualDevices)
  }

  var virtualDevicesTimer = $interval(refreshVirtualDevices, 10000)
  $scope.$on('$destroy', function() {
    $interval.cancel(virtualDevicesTimer)
  })

  refreshVirtualDevices()
}
