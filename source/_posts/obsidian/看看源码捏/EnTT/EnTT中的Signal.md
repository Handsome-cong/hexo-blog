---
publish: true
title: EnTT源码解读【8】：EnTT中的Signal
date: 2023-12-28 13:30
tags: EnTT
categories: blog
series: EnTT源码解读
keywords:
description:
top_img: https://user-images.githubusercontent.com/1812216/103550016-90752280-4ea8-11eb-8667-12ed2219e137.png
comments:
cover: https://user-images.githubusercontent.com/1812216/103550016-90752280-4ea8-11eb-8667-12ed2219e137.png
toc:
toc_number:
toc_style_simple:
copyright:
copyright_author:
copyright_author_href:
copyright_url:
copyright_info:
mathjax:
katex:
aplayer:
highlight_shrink:
aside:
abcjs:
---
# EnTT 中的 Signal
> signal 并不属于 ECS 的核心部分，但是 ECS 中有用到它，因此这里只是简单解释它的基本概念和用法。

## Signal 是什么
**Signal** 在 EnTT 中既可以指代 signal 模块，也可以是 `sigh` 类型。

EnTT 的 signal 模块提供了一套事件相关的工具，其中包含：
- `delegate`：类似于 `std::function`，用于包装方法
- `sigh`：命名是 "signal handler" 的缩写，用于存储一类特定类型的 `delegate`
- `sink`：对 `sigh` 的封装，用于添加和删除 `sigh` 中的 `delegate`
- `dispatcher`：提供了一套事件注册和触发机制
- `emitter`：职责与 `dispatcher` 类似，但是可自定义更强，为异步而设计

## 各部分介绍
### `delegate`
它的用法一看就懂：
```cpp
void g(const char &c, int i) { /* ... */ }
const char c = 'c';

delegate.connect<&g>(c);
delegate(42);
```

```cpp
entt::delegate<void(my_struct &, int)> delegate;
delegate.connect<&my_struct::f>();

my_struct instance;
delegate(instance, 42);
```

值得一提的是，它允许传入超出所需参数数量的参数：
```cpp
void g() { /* ... */ }
delegate.connect<&g>();
delegate(42);
```

多余的参数会在内部被丢弃。

### `sigh`
部分定义：
```cpp
// src/entt/signal/sigh.hpp

/**
 * @brief Unmanaged signal handler.
 *
 * It works directly with references to classes and pointers to member functions
 * as well as pointers to free functions. Users of this class are in charge of
 * disconnecting instances before deleting them.
 *
 * This class serves mainly two purposes:
 *
 * * Creating signals to use later to notify a bunch of listeners.
 * * Collecting results from a set of functions like in a voting system.
 *
 * @tparam Ret Return type of a function type.
 * @tparam Args Types of arguments of a function type.
 * @tparam Allocator Type of allocator used to manage memory and elements.
 */
template<typename Ret, typename... Args, typename Allocator>
class sigh<Ret(Args...), Allocator> {
    friend class sink<sigh<Ret(Args...), Allocator>>;

    using alloc_traits = std::allocator_traits<Allocator>;
    using delegate_type = delegate<Ret(Args...)>;
    using container_type = std::vector<delegate_type, typename alloc_traits::template rebind_alloc<delegate_type>>;

	...

private:
    container_type calls;
};
```

它只包含一个用于存储 `delegate` 的字段，显然，它就是一个存储 `delegate` 的容器。

它的用法：
```cpp
entt::sigh<void(int, char)> signal1;
signal1.publish(42, 'c');
  
entt::sigh<int()> signal2;  
std::vector<int> vec{};
signal2.collect([&vec](int value) { vec.push_back(value); });
```

`sigh` 只有两个公开的方法：
- `publish`：用传入的参数来调用每个 `delegate`
- `collect`：在 `publish` 的基础上，将每个 `delegate` 的返回值作为参数调用传入的回调，若回调返回值为 `bool`，且返回了 `true`，则 `collect` 会被中断

一个回调返回 `bool` 的示例：
```cpp
struct my_collector {
    std::vector<int> vec{};

    bool operator()(int v) {
        vec.push_back(v);
        return true;
    }
};

// ...

my_collector collector;
signal.collect(std::ref(collector));
```

### `sink`
部分定义：
```cpp
// src/entt/signal/sigh.hpp

/**
 * @brief Sink class.
 *
 * A sink is used to connect listeners to signals and to disconnect them.<br/>
 * The function type for a listener is the one of the signal to which it
 * belongs.
 *
 * The clear separation between a signal and a sink permits to store the former
 * as private data member without exposing the publish functionality to the
 * users of the class.
 *
 * @warning
 * Lifetime of a sink must not overcome that of the signal to which it refers.
 * In any other case, attempting to use a sink results in undefined behavior.
 *
 * @tparam Ret Return type of a function type.
 * @tparam Args Types of arguments of a function type.
 * @tparam Allocator Type of allocator used to manage memory and elements.
 */
template<typename Ret, typename... Args, typename Allocator>
class sink<sigh<Ret(Args...), Allocator>> {
    using signal_type = sigh<Ret(Args...), Allocator>;
    using delegate_type = typename signal_type::delegate_type;
    using difference_type = typename signal_type::container_type::difference_type;

	...

private:
    signal_type *signal;
};
```

`sink` 提供了一套为 `sigh` 添加和删除 `delegate` 的方法，它们往往在一起使用：
```cpp
entt::sigh<void(int, char)> signal;
void foo(int, char) { /* ... */ }

struct listener {
    void bar(const int &, char) { /* ... */ }
};

// ...

entt::sink sink{signal};
listener instance;

sink.connect<&foo>();
sink.connect<&listener::bar>(instance);

// ...

// disconnects a free function
sink.disconnect<&foo>();

// disconnect a member function of an instance
sink.disconnect<&listener::bar>(instance);

// disconnect all member functions of an instance, if any
sink.disconnect(&instance);

// discards all listeners at once
sink.disconnect();
```

❔为什么要单独设计一个 `sink` 类型

将 `sigh` 和 `sink` 分开可以更好地区分各自的职能。`sigh` 可以作为类型的私有成员存在，而 `delegate` 的注册功能就可以直接在公开的方法里返回一个 `sink` 对象来实现。
