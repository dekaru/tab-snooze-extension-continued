// @flow
import React, { Component } from 'react';
import styled, { keyframes } from 'styled-components';
import { getUndoStack } from '../../core/storage';
import { undoLastWakeup } from '../../core/snooze';

type Props = {};
type State = {
  visible: boolean,
  tabTitle: string,
  countdown: number,
};

const AUTO_DISMISS_TIME = 30; // seconds

export default class UndoSnackbar extends Component<Props, State> {
  state = {
    visible: false,
    tabTitle: '',
    countdown: AUTO_DISMISS_TIME,
  };

  intervalId: any = null;
  timeoutId: any = null;

  componentDidMount() {
    // Listen for storage changes to detect new wake-ups
    chrome.storage.onChanged.addListener(this.onStorageChanged);

    // Check if there's already something in the undo stack
    this.checkUndoStack();
  }

  componentWillUnmount() {
    chrome.storage.onChanged.removeListener(this.onStorageChanged);
    this.clearTimers();
  }

  clearTimers() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  onStorageChanged = (changes: any, namespace: string) => {
    if (namespace === 'session' && changes.undoStack) {
      this.checkUndoStack();
    }
  };

  async checkUndoStack() {
    const stack = await getUndoStack();

    if (stack.length > 0) {
      const latestItem = stack[0];

      // Only show if awakened recently (within last 35 seconds)
      const timeSinceAwoken = Date.now() - latestItem.awokenAt;
      if (timeSinceAwoken < 35000) {
        this.showSnackbar(latestItem.title);
      }
    }
  }

  showSnackbar(tabTitle: string) {
    this.clearTimers();

    this.setState({
      visible: true,
      tabTitle,
      countdown: AUTO_DISMISS_TIME,
    });

    // Countdown timer
    this.intervalId = setInterval(() => {
      this.setState(prevState => {
        const newCountdown = prevState.countdown - 1;
        if (newCountdown <= 0) {
          this.hideSnackbar();
        }
        return { countdown: newCountdown };
      });
    }, 1000);

    // Auto-hide after timeout
    this.timeoutId = setTimeout(() => {
      this.hideSnackbar();
    }, AUTO_DISMISS_TIME * 1000);
  }

  hideSnackbar() {
    this.clearTimers();
    this.setState({ visible: false });
  }

  async handleUndo() {
    const restoredTab = await undoLastWakeup();

    if (restoredTab) {
      console.log('✅ Undo successful:', restoredTab.title);
      this.hideSnackbar();
    } else {
      console.log('❌ Undo failed: no items in stack');
    }
  }

  render() {
    const { visible, tabTitle, countdown } = this.state;

    if (!visible) {
      return null;
    }

    return (
      <SnackbarContainer>
        <SnackbarContent>
          <Message>
            Tab awakened: <strong>{tabTitle}</strong>
          </Message>
          <Actions>
            <UndoButton onClick={() => this.handleUndo()}>
              ↶ UNDO ({countdown}s)
            </UndoButton>
            <CloseButton onClick={() => this.hideSnackbar()}>
              ✕
            </CloseButton>
          </Actions>
        </SnackbarContent>
      </SnackbarContainer>
    );
  }
}

const slideUp = keyframes`
  from {
    transform: translateY(100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
`;

const SnackbarContainer = styled.div`
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10000;
  animation: ${slideUp} 0.3s ease-out;
`;

const SnackbarContent = styled.div`
  background: #323232;
  color: white;
  padding: 14px 24px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 400px;
  max-width: 600px;
`;

const Message = styled.div`
  flex: 1;
  font-size: 14px;

  strong {
    font-weight: 600;
  }
`;

const Actions = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
`;

const UndoButton = styled.button`
  background: #4CAF50;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: #45a049;
  }

  &:active {
    background: #3d8b40;
  }
`;

const CloseButton = styled.button`
  background: transparent;
  color: white;
  border: none;
  padding: 4px 8px;
  font-size: 18px;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.2s;

  &:hover {
    opacity: 1;
  }
`;
