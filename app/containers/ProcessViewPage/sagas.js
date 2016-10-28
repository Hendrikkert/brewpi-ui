import { takeLatest, delay } from 'redux-saga';
import { take, put, select, fork, cancel } from 'redux-saga/effects';
import axios from 'axios';
import { LOCATION_CHANGE } from 'react-router-redux';
import * as actions from './actions';
import * as constants from './constants';
import { api } from '../../services/mockApi';
import {
  activeStepSettingsSelector,
  partSettingsSelector,
  layoutPartsSelector,
 } from './selectors';

function* fetchProcessView(action) {
  try {
    const view = api.getProcessView(action.viewId);
    yield put(actions.viewFetchSuccess(view));
  } catch (e) {
    yield put(actions.viewFetchFailed(e));
  }
}

function* getFetchProcessViewWatcher() {
  yield fork(takeLatest, constants.VIEW_FETCH_REQUESTED, fetchProcessView);
}

function* onStepSelected(action) {
  yield put(actions.activeStepChanged(action.stepId));
  const newPartSettings = yield select(activeStepSettingsSelector);
  yield put(actions.newPartSettingsReceived(newPartSettings));
}

function* getStepSelectedWatcher() {
  yield takeLatest(constants.STEP_SELECTED, onStepSelected);
}

function* onStepApplied() {
  const partSettings = yield select(partSettingsSelector);
  const parts = yield select(layoutPartsSelector);
  const motorValves = parts.filter((item) => item.getIn(['part', 'type']) === 'VALVE_MOTOR');
  const slotsToApply = [];
  for (const valve of motorValves) {
    // match setting to valve
    const id = valve.getIn(['part', 'id']);
    const match = partSettings.find((setting) => setting.get('id') === id);
    if (match) {
      const pos = match.getIn(['settings', 'pos']);
      const slot = valve.getIn(['options', 'slot']);
      slotsToApply.push({ pos, slot });
    }
  }
  const evenClose = slotsToApply.filter((slot) => slot.slot % 2 === 0 && slot.pos === 'closed');
  const unevenClose = slotsToApply.filter((slot) => slot.slot % 2 !== 0 && slot.pos === 'closed');
  const evenOpen = slotsToApply.filter((slot) => slot.slot % 2 === 0 && slot.pos === 'open');
  const unevenOpen = slotsToApply.filter((slot) => slot.slot % 2 !== 0 && slot.pos === 'open');
  yield delay(100);
  for (const group of [evenClose, unevenClose, evenOpen, unevenOpen]) {
    console.log(group);
    for (const slot of group) {
      console.log('applying ', JSON.stringify(slot));
      axios.post('http://192.168.1.100/socketmessage.php',
        `messageType=writeDevice&message={"i":${slot.slot},"w":${slot.pos === 'open' ? 1 : 2}}`
      );
    }
    if (group.length !== 0) {
      yield delay(10000);
    }
  }
}

function* getStepAppliedWatcher() {
  yield fork(takeLatest, constants.STEP_APPLIED, onStepApplied);
}

export function* rootSaga() {
  // fork watchers so can continue exucution
  const watchers = yield [
    fork(getStepSelectedWatcher),
    fork(getFetchProcessViewWatcher),
    fork(getStepAppliedWatcher),
  ];
  // Suspend execution until location changes
  yield take(LOCATION_CHANGE);
  for (const watcher of watchers) {
    yield cancel(watcher);
  }
}

// All sagas to be loaded
export default [
  rootSaga,
];
