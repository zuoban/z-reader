package singleflight

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestGroupDoDeduplicatesConcurrentCalls(t *testing.T) {
	var group Group[string]
	var executions atomic.Int32
	gate := make(chan struct{})

	const callers = 6
	results := make([]string, callers)
	var wg sync.WaitGroup
	wg.Add(callers)
	for i := range callers {
		go func(idx int) {
			defer wg.Done()
			val, err := group.Do("same-key", func() (string, error) {
				executions.Add(1)
				<-gate
				return "value", nil
			})
			if err != nil {
				t.Errorf("unexpected error: %v", err)
			}
			results[idx] = val
		}(i)
	}

	time.Sleep(15 * time.Millisecond)
	close(gate)
	wg.Wait()

	if got := executions.Load(); got != 1 {
		t.Fatalf("executions = %d, want 1", got)
	}
	for i, val := range results {
		if val != "value" {
			t.Fatalf("caller %d got %q, want value", i, val)
		}
	}
}

func TestGroupDoContextCancelsOnlyWhenLastWaiterLeaves(t *testing.T) {
	var group Group[string]
	started := make(chan struct{})
	release := make(chan struct{})
	workCanceled := make(chan struct{})

	ctx1, cancel1 := context.WithCancel(context.Background())
	err1Ch := make(chan error, 1)
	go func() {
		_, _, completed, err := group.DoContext(ctx1, "k", 0, func(workCtx context.Context) (string, error) {
			close(started)
			select {
			case <-release:
				return "ok", nil
			case <-workCtx.Done():
				close(workCanceled)
				return "", workCtx.Err()
			}
		})
		if completed {
			t.Error("expected canceled waiter to report completed=false")
		}
		err1Ch <- err
	}()
	<-started

	res2Ch := make(chan string, 1)
	go func() {
		val, _, completed, err := group.DoContext(context.Background(), "k", 0, func(context.Context) (string, error) {
			return "", errors.New("unexpected execution for joined waiter")
		})
		if !completed || err != nil {
			t.Errorf("second caller completed=%v err=%v", completed, err)
		}
		res2Ch <- val
	}()

	deadline := time.After(time.Second)
	for group.Waiters("k") != 2 {
		select {
		case <-deadline:
			t.Fatal("second waiter did not join")
		default:
			time.Sleep(time.Millisecond)
		}
	}

	cancel1()
	if !errors.Is(<-err1Ch, context.Canceled) {
		t.Fatal("expected context.Canceled for first waiter")
	}

	select {
	case <-workCanceled:
		t.Fatal("shared work canceled while second waiter still active")
	default:
	}

	close(release)
	if got := <-res2Ch; got != "ok" {
		t.Fatalf("second caller got %q, want ok", got)
	}

	// Single waiter cancellation cancels shared work.
	ctx3, cancel3 := context.WithCancel(context.Background())
	started = make(chan struct{})
	workCanceled = make(chan struct{})
	err3Ch := make(chan error, 1)
	go func() {
		_, _, _, err := group.DoContext(ctx3, "k2", time.Second, func(workCtx context.Context) (string, error) {
			close(started)
			<-workCtx.Done()
			close(workCanceled)
			return "", workCtx.Err()
		})
		err3Ch <- err
	}()
	<-started
	cancel3()
	if !errors.Is(<-err3Ch, context.Canceled) {
		t.Fatal("expected context.Canceled for single waiter")
	}
	select {
	case <-workCanceled:
	case <-time.After(time.Second):
		t.Fatal("expected workCtx to cancel when last waiter left")
	}
}
