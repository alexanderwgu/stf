var _ = require('lodash')

module.exports = function DeviceControlCtrl($scope, DeviceService, GroupService,
  $location, $timeout, $window, $rootScope, LogcatService, CommonService,
  AiTasksService, $uibModal, $interval) {

  $scope.showScreen = true

  $scope.groupTracker = DeviceService.trackGroup($scope)

  $scope.groupDevices = $scope.groupTracker.devices

  $scope.$on('$locationChangeStart', function(event, next, current) {
    $scope.LogcatService = LogcatService
    $rootScope.LogcatService = LogcatService
  })

  $scope.kickDevice = function(device) {
    if (Object.keys(LogcatService.deviceEntries).includes(device.serial)) {
      LogcatService.deviceEntries[device.serial].allowClean = true
    }

    $scope.LogcatService = LogcatService
    $rootScope.LogcatService = LogcatService

    if (!device || !$scope.device) {
      alert('No device found')
      return
    }

    try {
      // If we're trying to kick current device
      if (device.serial === $scope.device.serial) {

        // If there is more than one device left
        if ($scope.groupDevices.length > 1) {

          // Control first free device first
          var firstFreeDevice = _.find($scope.groupDevices, function(dev) {
            return dev.serial !== $scope.device.serial
          })
          $scope.controlDevice(firstFreeDevice)

          // Then kick the old device
          GroupService.kick(device).then(function() {
            $scope.$digest()
          })
        } else {
          // Kick the device
          GroupService.kick(device).then(function() {
            $scope.$digest()
          })
          $location.path('/devices/')
        }
      } else {
        GroupService.kick(device).then(function() {
          $scope.$digest()
        })
      }
    } catch (e) {
      alert(e.message)
    }
  }

  $scope.controlDevice = function(device) {
    $location.path('/control/' + device.serial)
  }

  function isPortrait(val) {
    var value = val
    if (typeof value === 'undefined' && $scope.device) {
      value = $scope.device.display.rotation
    }
    return (value === 0 || value === 180)
  }

  function isLandscape(val) {
    var value = val
    if (typeof value === 'undefined' && $scope.device) {
      value = $scope.device.display.rotation
    }
    return (value === 90 || value === 270)
  }

  $scope.tryToRotate = function(rotation) {
    if (rotation === 'portrait') {
      $scope.control.rotate(0)
      $timeout(function() {
        if (isLandscape()) {
          $scope.currentRotation = 'landscape'
        }
      }, 400)
    } else if (rotation === 'landscape') {
      $scope.control.rotate(90)
      $timeout(function() {
        if (isPortrait()) {
          $scope.currentRotation = 'portrait'
        }
      }, 400)
    }
  }

  $scope.currentRotation = 'portrait'

  $scope.$watch('device.display.rotation', function(newValue) {
    if (isPortrait(newValue)) {
      $scope.currentRotation = 'portrait'
    } else if (isLandscape(newValue)) {
      $scope.currentRotation = 'landscape'
    }
  })

  // TODO: Refactor this inside control and server-side
  $scope.rotateLeft = function() {
    var angle = 0
    if ($scope.device && $scope.device.display) {
      angle = $scope.device.display.rotation
    }
    if (angle === 0) {
      angle = 270
    } else {
      angle -= 90
    }
    $scope.control.rotate(angle)

    if ($rootScope.standalone) {
      $window.resizeTo($window.outerHeight, $window.outerWidth)
    }
  }

  $scope.rotateRight = function() {
    var angle = 0
    if ($scope.device && $scope.device.display) {
      angle = $scope.device.display.rotation
    }
    if (angle === 270) {
      angle = 0
    } else {
      angle += 90
    }
    $scope.control.rotate(angle)

    if ($rootScope.standalone) {
      $window.resizeTo($window.outerHeight, $window.outerWidth)
    }
  }

  $scope.aiTasks = []
  $scope.aiTaskLoading = false
  $scope.showAiLog = false

  function refreshAiTasks() {
    if (!$scope.device || !$scope.device.serial) {
      return
    }
    $scope.aiTaskLoading = true
    return CommonService.errorWrapper(AiTasksService.listByDevice, [
      $scope.device.serial
    ])
    .then(function(response) {
      if (response && response.data && response.data.aiTasks) {
        $scope.aiTasks = response.data.aiTasks
      }
    })
    .finally(function() {
      $scope.aiTaskLoading = false
    })
  }

  $scope.latestAiTask = function() {
    if (!$scope.aiTasks.length) {
      return null
    }
    return $scope.aiTasks.slice().sort(function(a, b) {
      return new Date(b.createdAt) - new Date(a.createdAt)
    })[0]
  }

  $scope.openAiTaskModal = function() {
    if (!$scope.device || !$scope.device.serial) {
      return
    }

    var modalInstance = $uibModal.open({
      template: require('./ai-task-modal.pug')
    , controller: function($scope, $uibModalInstance) {
        $scope.modal = {
          prompt: ''
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
      if (!values.prompt || !values.prompt.trim()) {
        return
      }
      CommonService.errorWrapper(AiTasksService.create, [
        $scope.device.serial
      , values.prompt.trim()
      ])
      .then(refreshAiTasks)
    })
  }

  $scope.cancelAiTask = function(task) {
    if (!task) {
      return
    }
    CommonService.errorWrapper(AiTasksService.cancel, [task.id])
      .then(refreshAiTasks)
  }

  $scope.toggleAiLog = function() {
    $scope.showAiLog = !$scope.showAiLog
  }

  $scope.copyAiLog = function() {
    var task = $scope.latestAiTask()
    if (!task) {
      return
    }
    var content = (task.lastError || '') + '\n' + (task.logTail || '')
    CommonService.copyToClipboard(content.trim())
  }

  var aiTasksTimer = $interval(refreshAiTasks, 10000)
  $scope.$on('$destroy', function() {
    $interval.cancel(aiTasksTimer)
  })

  $scope.$watch('device.serial', function(newValue) {
    if (newValue) {
      refreshAiTasks()
    }
  })

}
