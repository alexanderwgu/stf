module.exports = function AiPaneCtrl($scope, CommonService, AiTasksService, $uibModal, $interval) {
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
  $scope.refreshAiTasks = refreshAiTasks

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
      template: require('../device-control/ai-task-modal.pug'),
      controller: function($scope, $uibModalInstance) {
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
        $scope.device.serial,
        values.prompt.trim()
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
