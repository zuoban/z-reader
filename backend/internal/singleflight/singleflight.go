package singleflight

import (
	"context"
	"sync"
	"sync/atomic"
	"time"
)

type call[T any] struct {
	done    chan struct{}
	ctx     context.Context
	cancel  context.CancelFunc
	waiters atomic.Int64
	val     T
	err     error
}

// Group deduplicates concurrent work by key using reference-counted waiters.
// The shared work cancels only when every active waiter stops waiting or the
// optional timeout expires.
type Group[T any] struct {
	mu    sync.Mutex
	calls map[string]*call[T]
}

// Do deduplicates concurrent calls for key without caller cancellation.
func (g *Group[T]) Do(key string, fn func() (T, error)) (T, error) {
	val, _, _, err := g.DoContext(context.Background(), key, 0, func(context.Context) (T, error) {
		return fn()
	})
	return val, err
}

// DoContext joins or starts an in-flight call for key. It returns the shared
// result, the waiter count observed at join/completion, whether the shared call
// completed before ctx expired, and any error.
func (g *Group[T]) DoContext(
	ctx context.Context,
	key string,
	timeout time.Duration,
	fn func(context.Context) (T, error),
) (val T, waiters int64, completed bool, err error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		var zero T
		return zero, 0, false, err
	}

	g.mu.Lock()
	if g.calls == nil {
		g.calls = make(map[string]*call[T])
	}
	c, ok := g.calls[key]
	if ok && c.ctx.Err() == nil {
		c.waiters.Add(1)
		g.mu.Unlock()
	} else {
		var workCtx context.Context
		var cancel context.CancelFunc
		if timeout > 0 {
			workCtx, cancel = context.WithTimeout(context.Background(), timeout)
		} else {
			workCtx, cancel = context.WithCancel(context.Background())
		}
		c = &call[T]{
			done:   make(chan struct{}),
			ctx:    workCtx,
			cancel: cancel,
		}
		c.waiters.Store(1)
		g.calls[key] = c
		g.mu.Unlock()

		go func() {
			defer func() {
				g.mu.Lock()
				if g.calls[key] == c {
					delete(g.calls, key)
				}
				g.mu.Unlock()
				cancel()
				close(c.done)
			}()
			c.val, c.err = fn(workCtx)
		}()
	}

	select {
	case <-c.done:
		return c.val, c.waiters.Load(), true, c.err
	case <-ctx.Done():
		g.mu.Lock()
		if c.waiters.Add(-1) == 0 {
			c.cancel()
			if g.calls[key] == c {
				delete(g.calls, key)
			}
		}
		g.mu.Unlock()
		var zero T
		return zero, 0, false, ctx.Err()
	}
}

// Waiters returns the current active waiter count for an in-flight key.
func (g *Group[T]) Waiters(key string) int64 {
	g.mu.Lock()
	defer g.mu.Unlock()
	if c := g.calls[key]; c != nil {
		return c.waiters.Load()
	}
	return 0
}
