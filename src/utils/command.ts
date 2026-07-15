/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useRef } from 'react';
import { ControlPoint, CrossSectionParams, SectionSegment } from '../types';
import { RoadNetwork, AlignmentPlan, LODLevel, detectRoadIntersections } from './network';

/**
 * 道路設計のシステムグローバル状態 (複数路線対応のイベントソーシングステート)
 */
export interface AppState {
  network: RoadNetwork;
}

/**
 * 道路設計のイベントソーシング・コマンドインターフェース
 */
export interface Command {
  id: string;
  type: string;
  timestamp: number;
  description: string;
  stateSnapshot?: AppState;
  
  /**
   * 現在の状態にこのコマンドを適用し、新しい状態を返す（イミュータブル）
   */
  execute(state: AppState): AppState;
  
  /**
   * 適用されたコマンドを元に戻し、直前の状態を返す（イミュータブル）
   */
  undo(state: AppState): AppState;
}

/**
 * ヘルパー：アクティブな路線をクローンして更新する純粋関数
 */
function updateActiveAlignment(state: AppState, updater: (plan: AlignmentPlan) => AlignmentPlan): AppState {
  const activeId = state.network.activeAlignmentId;
  const activePlan = state.network.alignments[activeId];
  if (!activePlan) return state;

  const nextAlignments = {
    ...state.network.alignments,
    [activeId]: updater(activePlan)
  };

  const nextNetwork = {
    ...state.network,
    alignments: nextAlignments
  };

  // 交差点を再計算
  nextNetwork.intersections = detectRoadIntersections(nextNetwork);

  return {
    ...state,
    network: nextNetwork
  };
}

/**
 * 1. 平面制御点（BP, IP, EP）一括更新・履歴保存コマンド
 */
export class UpdateControlPointsCommand implements Command {
  id = Math.random().toString(36).substring(2, 11);
  type = 'UPDATE_CONTROL_POINTS';
  timestamp = Date.now();

  constructor(
    public description: string,
    private prevPoints: ControlPoint[],
    private nextPoints: ControlPoint[]
  ) {}

  execute(state: AppState): AppState {
    return updateActiveAlignment(state, (plan) => ({
      ...plan,
      points: this.nextPoints
    }));
  }

  undo(state: AppState): AppState {
    return updateActiveAlignment(state, (plan) => ({
      ...plan,
      points: this.prevPoints
    }));
  }
}

/**
 * 2. 断面パラメータ更新コマンド
 */
export class UpdateCrossSectionCommand implements Command {
  id = Math.random().toString(36).substring(2, 11);
  type = 'UPDATE_CROSS_SECTION';
  timestamp = Date.now();

  constructor(
    public description: string,
    private prevSection: CrossSectionParams,
    private nextSection: CrossSectionParams
  ) {}

  execute(state: AppState): AppState {
    return updateActiveAlignment(state, (plan) => ({
      ...plan,
      crossSection: this.nextSection
    }));
  }

  undo(state: AppState): AppState {
    return updateActiveAlignment(state, (plan) => ({
      ...plan,
      crossSection: this.prevSection
    }));
  }
}

/**
 * 3. 断面区間セグメント更新コマンド
 */
export class UpdateSegmentsCommand implements Command {
  id = Math.random().toString(36).substring(2, 11);
  type = 'UPDATE_SEGMENTS';
  timestamp = Date.now();

  constructor(
    public description: string,
    private prevSegments: SectionSegment[],
    private nextSegments: SectionSegment[]
  ) {}

  execute(state: AppState): AppState {
    return updateActiveAlignment(state, (plan) => ({
      ...plan,
      segments: this.nextSegments
    }));
  }

  undo(state: AppState): AppState {
    return updateActiveAlignment(state, (plan) => ({
      ...plan,
      segments: this.prevSegments
    }));
  }
}

/**
 * 4. 公共平面直交座標系 (JGD2011 第I系〜第XIX系) 切り替えコマンド
 */
export class UpdateCoordinateZoneCommand implements Command {
  id = Math.random().toString(36).substring(2, 11);
  type = 'UPDATE_COORDINATE_ZONE';
  timestamp = Date.now();

  constructor(
    public description: string,
    private prevZone: number,
    private nextZone: number
  ) {}

  execute(state: AppState): AppState {
    return updateActiveAlignment(state, (plan) => ({
      ...plan,
      coordinateZone: this.nextZone
    }));
  }

  undo(state: AppState): AppState {
    return updateActiveAlignment(state, (plan) => ({
      ...plan,
      coordinateZone: this.prevZone
    }));
  }
}

/**
 * 5. 全体状態一括置換（Firestoreロード用・一括Undo/Redo用）
 */
export class ReplaceAllStateCommand implements Command {
  id = Math.random().toString(36).substring(2, 11);
  type = 'REPLACE_ALL_STATE';
  timestamp = Date.now();

  constructor(
    public description: string,
    private prevState: AppState,
    private nextState: AppState
  ) {}

  execute(state: AppState): AppState {
    return { ...this.nextState };
  }

  undo(state: AppState): AppState {
    return { ...this.prevState };
  }
}

/**
 * 6. 新規路線の追加コマンド
 */
export class AddAlignmentCommand implements Command {
  id = Math.random().toString(36).substring(2, 11);
  type = 'ADD_ALIGNMENT';
  timestamp = Date.now();

  constructor(
    public description: string,
    private newPlan: AlignmentPlan
  ) {}

  execute(state: AppState): AppState {
    const nextAlignments = {
      ...state.network.alignments,
      [this.newPlan.id]: this.newPlan
    };

    const nextNetwork = {
      ...state.network,
      alignments: nextAlignments,
      activeAlignmentId: this.newPlan.id // 追加された路線をアクティブにする
    };

    nextNetwork.intersections = detectRoadIntersections(nextNetwork);

    return {
      ...state,
      network: nextNetwork
    };
  }

  undo(state: AppState): AppState {
    const nextAlignments = { ...state.network.alignments };
    delete nextAlignments[this.newPlan.id];

    // アクティブな路線が削除された場合は、残っている最初の路線、または空文字にする
    const remainingIds = Object.keys(nextAlignments);
    const nextActiveId = remainingIds.includes(state.network.activeAlignmentId)
      ? state.network.activeAlignmentId
      : (remainingIds[0] || '');

    const nextNetwork = {
      ...state.network,
      alignments: nextAlignments,
      activeAlignmentId: nextActiveId
    };

    nextNetwork.intersections = detectRoadIntersections(nextNetwork);

    return {
      ...state,
      network: nextNetwork
    };
  }
}

/**
 * 7. 路線削除コマンド
 */
export class DeleteAlignmentCommand implements Command {
  id = Math.random().toString(36).substring(2, 11);
  type = 'DELETE_ALIGNMENT';
  timestamp = Date.now();
  private deletedPlan: AlignmentPlan;
  private prevActiveId: string;

  constructor(
    public description: string,
    private targetRoadId: string,
    state: AppState
  ) {
    this.deletedPlan = state.network.alignments[targetRoadId];
    this.prevActiveId = state.network.activeAlignmentId;
  }

  execute(state: AppState): AppState {
    const nextAlignments = { ...state.network.alignments };
    delete nextAlignments[this.targetRoadId];

    const remainingIds = Object.keys(nextAlignments);
    const nextActiveId = this.prevActiveId === this.targetRoadId
      ? (remainingIds[0] || '')
      : this.prevActiveId;

    const nextNetwork = {
      ...state.network,
      alignments: nextAlignments,
      activeAlignmentId: nextActiveId
    };

    nextNetwork.intersections = detectRoadIntersections(nextNetwork);

    return {
      ...state,
      network: nextNetwork
    };
  }

  undo(state: AppState): AppState {
    if (!this.deletedPlan) return state;

    const nextAlignments = {
      ...state.network.alignments,
      [this.targetRoadId]: this.deletedPlan
    };

    const nextNetwork = {
      ...state.network,
      alignments: nextAlignments,
      activeAlignmentId: this.prevActiveId
    };

    nextNetwork.intersections = detectRoadIntersections(nextNetwork);

    return {
      ...state,
      network: nextNetwork
    };
  }
}

/**
 * 8. アクティブ路線切り替えコマンド
 */
export class SwitchActiveAlignmentCommand implements Command {
  id = Math.random().toString(36).substring(2, 11);
  type = 'SWITCH_ACTIVE_ALIGNMENT';
  timestamp = Date.now();

  constructor(
    public description: string,
    private prevActiveId: string,
    private nextActiveId: string
  ) {}

  execute(state: AppState): AppState {
    return {
      ...state,
      network: {
        ...state.network,
        activeAlignmentId: this.nextActiveId
      }
    };
  }

  undo(state: AppState): AppState {
    return {
      ...state,
      network: {
        ...state.network,
        activeAlignmentId: this.prevActiveId
      }
    };
  }
}

/**
 * 9. 各種路線の詳細パラメータ（LOD, 高さオフセット, 可視性, 路線名）更新コマンド
 */
export class UpdateRoadMetadataCommand implements Command {
  id = Math.random().toString(36).substring(2, 11);
  type = 'UPDATE_ROAD_METADATA';
  timestamp = Date.now();

  constructor(
    public description: string,
    private roadId: string,
    private prevFields: Partial<AlignmentPlan>,
    private nextFields: Partial<AlignmentPlan>
  ) {}

  execute(state: AppState): AppState {
    const plan = state.network.alignments[this.roadId];
    if (!plan) return state;

    const nextAlignments = {
      ...state.network.alignments,
      [this.roadId]: { ...plan, ...this.nextFields }
    };

    const nextNetwork = {
      ...state.network,
      alignments: nextAlignments
    };

    // 高さが変わると交差点も再計算
    nextNetwork.intersections = detectRoadIntersections(nextNetwork);

    return {
      ...state,
      network: nextNetwork
    };
  }

  undo(state: AppState): AppState {
    const plan = state.network.alignments[this.roadId];
    if (!plan) return state;

    const nextAlignments = {
      ...state.network.alignments,
      [this.roadId]: { ...plan, ...this.prevFields }
    };

    const nextNetwork = {
      ...state.network,
      alignments: nextAlignments
    };

    nextNetwork.intersections = detectRoadIntersections(nextNetwork);

    return {
      ...state,
      network: nextNetwork
    };
  }
}

/**
 * イベントソーシング型 Command 履歴・スタック管理者
 */
export class CommandManager {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private maxHistory: number;

  constructor(maxHistory: number = 50) {
    this.maxHistory = maxHistory;
  }

  public execute(command: Command, currentState: AppState): AppState {
    const nextState = command.execute(currentState);
    command.stateSnapshot = nextState;
    this.undoStack.push(command);
    this.redoStack = [];
    
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    
    return nextState;
  }

  public undo(currentState: AppState): { state: AppState; undoneCommand?: Command } {
    if (this.undoStack.length === 0) {
      return { state: currentState };
    }

    const command = this.undoStack.pop()!;
    const previousState = command.undo(currentState);
    this.redoStack.push(command);

    return { state: previousState, undoneCommand: command };
  }

  public redo(currentState: AppState): { state: AppState; redoneCommand?: Command } {
    if (this.redoStack.length === 0) {
      return { state: currentState };
    }

    const command = this.redoStack.pop()!;
    const nextState = command.execute(currentState);
    command.stateSnapshot = nextState;
    this.undoStack.push(command);

    return { state: nextState, redoneCommand: command };
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public getUndoHistory() {
    return this.undoStack.map(c => ({
      id: c.id,
      type: c.type,
      description: c.description,
      timestamp: c.timestamp,
      stateSnapshot: c.stateSnapshot
    }));
  }

  public getRedoHistory() {
    return this.redoStack.map(c => ({
      id: c.id,
      type: c.type,
      description: c.description,
      timestamp: c.timestamp,
      stateSnapshot: c.stateSnapshot
    }));
  }

  public clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}

/**
 * React 状態と CommandManager を橋渡しする高機能カスタムフック
 */
export function useRoadCommands(initialState: AppState) {
  const [state, setState] = useState<AppState>(initialState);
  const managerRef = useRef(new CommandManager(50));
  const initialStateRef = useRef<AppState>(initialState);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [history, setHistory] = useState<{
    undo: { id: string; type: string; description: string; timestamp: number; stateSnapshot?: AppState }[];
    redo: { id: string; type: string; description: string; timestamp: number; stateSnapshot?: AppState }[];
  }>({ undo: [], redo: [] });

  const updateStatus = useCallback(() => {
    setCanUndo(managerRef.current.canUndo());
    setCanRedo(managerRef.current.canRedo());
    setHistory({
      undo: managerRef.current.getUndoHistory(),
      redo: managerRef.current.getRedoHistory(),
    });
  }, []);

  const executeCommand = useCallback((command: Command) => {
    setState(prev => {
      const next = managerRef.current.execute(command, prev);
      setTimeout(updateStatus, 0);
      return next;
    });
  }, [updateStatus]);

  const undo = useCallback(() => {
    setState(prev => {
      const { state: next } = managerRef.current.undo(prev);
      setTimeout(updateStatus, 0);
      return next;
    });
  }, [updateStatus]);

  const redo = useCallback(() => {
    setState(prev => {
      const { state: next } = managerRef.current.redo(prev);
      setTimeout(updateStatus, 0);
      return next;
    });
  }, [updateStatus]);

  const clearHistory = useCallback(() => {
    managerRef.current.clear();
    updateStatus();
  }, [updateStatus]);

  return {
    state,
    executeCommand,
    undo,
    redo,
    canUndo,
    canRedo,
    history,
    clearHistory,
    setStateDirectly: setState,
    initialState: initialStateRef.current,
  };
}
