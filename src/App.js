import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { database } from './firebase';
import { ref, onValue, push, set, remove } from 'firebase/database';
import './App.css';

const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8'];

// カテゴリ別の色
const CATEGORY_COLORS = {
  '食費': '#FF6B6B',
  '外食': '#4ECDC4',
  'デート': '#FF69B4',
  '日用品': '#FFA07A',
  'その他❤️': '#9B59B6',
  '日用品費': '#FFA07A',
  '立て替え': '#FF9800'  // オレンジ色で特別表示
};

// 担当者別の背景色
const PERSON_COLORS = {
  'ひも': {
    background: '#E3F2FD',
    border: '#2196F3'
  },
  'あづ': {
    background: '#FCE4EC',
    border: '#E91E63'
  }
};

const APP_PASSWORD = 'azuhimo';

// 給料日基準で月を計算する関数 (21日〜翌月20日)
function getPayrollMonth(date) {
  const d = new Date(date);
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  
  if (day >= 21) {
    if (month === 12) {
      return `${year + 1}-01`;
    }
    return `${year}-${String(month + 1).padStart(2, '0')}`;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}

// 給料日基準の月の開始日・終了日を取得
function getPayrollPeriod(payrollMonth) {
  const [year, month] = payrollMonth.split('-').map(Number);
  
  let startMonth = month - 1;
  let startYear = year;
  if (startMonth === 0) {
    startMonth = 12;
    startYear = year - 1;
  }
  const startDate = `${startYear}-${String(startMonth).padStart(2, '0')}-21`;
  const endDate = `${year}-${String(month).padStart(2, '0')}-20`;
  
  return { startDate, endDate };
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [expenses, setExpenses] = useState([]);
  const [activityLog, setActivityLog] = useState([]);
  const [categories, setCategories] = useState(['食費', '外食', 'デート', '日用品', 'その他❤️', '立て替え']);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [currentView, setCurrentView] = useState('list');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    description: '',
    amount: '',
    person: 'ひも',
    category: '食費',
    memo: ''
  });

  const [newCategory, setNewCategory] = useState('');

  // Firebaseからデータをリアルタイムで取得
  useEffect(() => {
    const expensesRef = ref(database, 'expenses');
    const categoriesRef = ref(database, 'categories');
    const activityLogRef = ref(database, 'activityLog');
    
    const unsubscribeExpenses = onValue(expensesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const expensesList = Object.keys(data).map(key => ({
          firebaseId: key,
          ...data[key]
        })).sort((a, b) => new Date(b.date) - new Date(a.date));
        setExpenses(expensesList);
      }
      setIsLoading(false);
    });

    const unsubscribeCategories = onValue(categoriesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setCategories(data);
      }
    });

    const unsubscribeActivityLog = onValue(activityLogRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const logList = Object.keys(data).map(key => ({
          id: key,
          ...data[key]
        })).sort((a, b) => b.timestamp - a.timestamp);
        setActivityLog(logList);
      }
    });

    const savedAuth = sessionStorage.getItem('authenticated');
    if (savedAuth) setIsAuthenticated(true);
    
    const today = new Date().toISOString().split('T')[0];
    const currentPayrollMonth = getPayrollMonth(today);
    setSelectedMonth(currentPayrollMonth);

    return () => {
      unsubscribeExpenses();
      unsubscribeCategories();
      unsubscribeActivityLog();
    };
  }, []);

  const addActivityLog = async (action, details) => {
    const activityLogRef = ref(database, 'activityLog');
    const logEntry = {
      action,
      details,
      timestamp: Date.now(),
      date: new Date().toISOString()
    };
    await push(activityLogRef, logEntry);
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (password === APP_PASSWORD) {
      setIsAuthenticated(true);
      sessionStorage.setItem('authenticated', 'true');
      setPassword('');
    } else {
      alert('パスワードが正しくありません');
    }
  };

  const handleAddExpense = async (e) => {
    e.preventDefault();
    const expensesRef = ref(database, 'expenses');
    const newExpense = {
      id: Date.now(),
      ...formData,
      amount: parseFloat(formData.amount)
    };
    
    await push(expensesRef, newExpense);
    
    // アクティビティログに記録
    await addActivityLog('追加', {
      person: formData.person,
      description: formData.description,
      amount: formData.amount,
      category: formData.category,
      date: formData.date
    });
    
    setFormData({
      date: new Date().toISOString().split('T')[0],
      description: '',
      amount: '',
      person: 'ひも',
      category: '食費',
      memo: ''
    });
    setShowAddForm(false);
  };

  const handleDeleteExpense = async (firebaseId, expense) => {
    if (window.confirm('この項目を削除しますか?')) {
      const expenseRef = ref(database, `expenses/${firebaseId}`);
      await remove(expenseRef);
      
      // アクティビティログに記録
      await addActivityLog('削除', {
        person: expense.person,
        description: expense.description,
        amount: expense.amount,
        category: expense.category,
        date: expense.date
      });
    }
  };

  const handleAddCategory = async () => {
    if (newCategory && !categories.includes(newCategory)) {
      const newCategories = [...categories, newCategory];
      const categoriesRef = ref(database, 'categories');
      await set(categoriesRef, newCategories);
      setNewCategory('');
    }
  };

  const handleDeleteCategory = async (category) => {
    if (window.confirm(`「${category}」を削除しますか?`)) {
      const newCategories = categories.filter(cat => cat !== category);
      const categoriesRef = ref(database, 'categories');
      await set(categoriesRef, newCategories);
    }
  };

  const getFilteredExpenses = () => {
    const { startDate, endDate } = getPayrollPeriod(selectedMonth);
    return expenses.filter(exp => {
      return exp.date >= startDate && exp.date <= endDate;
    });
  };

  const getStats = () => {
    const filtered = getFilteredExpenses();
    
    // 일반 지출 합계 (立て替え 제외)
    const himoNormalTotal = filtered
      .filter(exp => exp.category !== '立て替え' && exp.person === 'ひも')
      .reduce((sum, exp) => sum + exp.amount, 0);
    
    const azuNormalTotal = filtered
      .filter(exp => exp.category !== '立て替え' && exp.person === 'あづ')
      .reduce((sum, exp) => sum + exp.amount, 0);
    
    // 立て替え 금액 (표시용)
    const himoTatekaeTotal = filtered
      .filter(exp => exp.category === '立て替え' && exp.person === 'ひも')
      .reduce((sum, exp) => sum + exp.amount, 0);
    
    const azuTatekaeTotal = filtered
      .filter(exp => exp.category === '立て替え' && exp.person === 'あづ')
      .reduce((sum, exp) => sum + exp.amount, 0);
    
    // 표시용 합계 (각자 입력한 것으로)
    const himoTotal = himoNormalTotal + himoTatekaeTotal;
    const azuTotal = azuNormalTotal + azuTatekaeTotal;
    
    // 정산 계산 (일반 지출만 반반)
    const normalTotal = himoNormalTotal + azuNormalTotal;
    const halfNormal = normalTotal / 2;
    
    // 일반 지출 기준 정산액
    let settlementAmount = 0;
    let settlementDirection = '';
    
    if (himoNormalTotal > azuNormalTotal) {
      settlementAmount = himoNormalTotal - halfNormal;
      settlementDirection = 'あづ → ひも';
    } else if (azuNormalTotal > himoNormalTotal) {
      settlementAmount = azuNormalTotal - halfNormal;
      settlementDirection = 'ひも → あづ';
    }
    
    // 立て替え 금액 조정
    // あづ가 立て替え 입력 → ひも에게서 받아야 함 (정산액에서 빼기)
    // ひも가 立て替え 입력 → あづ에게서 받아야 함 (정산액에 더하기)
    const tatekaeAdjustment = azuTatekaeTotal - himoTatekaeTotal;
    
    if (settlementDirection === 'あづ → ひも') {
      settlementAmount -= tatekaeAdjustment;
      if (settlementAmount < 0) {
        settlementAmount = Math.abs(settlementAmount);
        settlementDirection = 'ひも → あづ';
      }
    } else if (settlementDirection === 'ひも → あづ') {
      settlementAmount += tatekaeAdjustment;
      if (settlementAmount < 0) {
        settlementAmount = Math.abs(settlementAmount);
        settlementDirection = 'あづ → ひも';
      }
    } else {
      // 정산액이 0인 경우
      if (tatekaeAdjustment > 0) {
        settlementAmount = tatekaeAdjustment;
        settlementDirection = 'ひも → あづ';
      } else if (tatekaeAdjustment < 0) {
        settlementAmount = Math.abs(tatekaeAdjustment);
        settlementDirection = 'あづ → ひも';
      }
    }
    
    const categoryStats = categories.map(cat => ({
      name: cat,
      amount: filtered.filter(exp => exp.category === cat).reduce((sum, exp) => sum + exp.amount, 0)
    })).filter(stat => stat.amount > 0);

    return { 
      himoTotal, 
      azuTotal, 
      total: normalTotal, // 일반 지출만
      half: halfNormal,   // 일반 지출의 반
      categoryStats,
      settlementAmount: Math.round(settlementAmount),
      settlementDirection
    };
  };

  // 사용 가능한 급여일 정산 월 목록 생성 (전체)
  const getAvailableMonths = () => {
    if (expenses.length === 0) {
      // 데이터가 없으면 현재 월만 표시
      const today = new Date().toISOString().split('T')[0];
      return [getPayrollMonth(today)];
    }
    
    // 모든 지출 데이터에서 급여일 정산 월 추출
    const monthSet = new Set();
    expenses.forEach(exp => {
      const payrollMonth = getPayrollMonth(exp.date);
      monthSet.add(payrollMonth);
    });
    
    // 현재 월도 추가 (데이터가 없어도 입력 가능하도록)
    const today = new Date().toISOString().split('T')[0];
    monthSet.add(getPayrollMonth(today));
    
    // 정렬 (최신순) - 전체 반환
    return Array.from(monthSet).sort((a, b) => b.localeCompare(a));
  };

  // 이전 달로 이동
  const goToPreviousMonth = () => {
    const availableMonths = getAvailableMonths();
    const currentIndex = availableMonths.indexOf(selectedMonth);
    if (currentIndex < availableMonths.length - 1) {
      setSelectedMonth(availableMonths[currentIndex + 1]);
    }
  };

  // 다음 달로 이동
  const goToNextMonth = () => {
    const availableMonths = getAvailableMonths();
    const currentIndex = availableMonths.indexOf(selectedMonth);
    if (currentIndex > 0) {
      setSelectedMonth(availableMonths[currentIndex - 1]);
    }
  };

  // 月別推移データを取得
  const getTrendData = () => {
    const months = Array.from({length: 6}, (_, i) => {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      return getPayrollMonth(date.toISOString().split('T')[0]);
    }).reverse();

    return months.map(payrollMonth => {
      const { startDate, endDate } = getPayrollPeriod(payrollMonth);
      const monthExpenses = expenses.filter(exp => exp.date >= startDate && exp.date <= endDate);
      
      // 일반 지출만 계산 (立て替え 제외)
      const himoNormalTotal = monthExpenses
        .filter(exp => exp.category !== '立て替え' && exp.person === 'ひも')
        .reduce((sum, exp) => sum + exp.amount, 0);
      
      const azuNormalTotal = monthExpenses
        .filter(exp => exp.category !== '立て替え' && exp.person === 'あづ')
        .reduce((sum, exp) => sum + exp.amount, 0);
      
      // 立て替え 금액
      const himoTatekaeTotal = monthExpenses
        .filter(exp => exp.category === '立て替え' && exp.person === 'ひも')
        .reduce((sum, exp) => sum + exp.amount, 0);
      
      const azuTatekaeTotal = monthExpenses
        .filter(exp => exp.category === '立て替え' && exp.person === 'あづ')
        .reduce((sum, exp) => sum + exp.amount, 0);
      
      const himoTotal = himoNormalTotal + himoTatekaeTotal;
      const azuTotal = azuNormalTotal + azuTatekaeTotal;
      const total = himoNormalTotal + azuNormalTotal; // 일반 지출만
      
      const categoryData = {};
      categories.forEach(cat => {
        categoryData[cat] = monthExpenses.filter(exp => exp.category === cat).reduce((sum, exp) => sum + exp.amount, 0);
      });
      
      return {
        month: payrollMonth,
        total,
        ひも: himoTotal,
        あづ: azuTotal,
        ...categoryData
      };
    });
  };

  const stats = getStats();
  const { startDate, endDate } = getPayrollPeriod(selectedMonth);
  const trendData = getTrendData();

  if (!isAuthenticated) {
    return (
      <div className="login-container">
        <div className="login-box">
          <h1>🔐 支出明細</h1>
          <p className="firebase-badge">🔥 Firebase版 - 給料日精算 (21日〜20日)</p>
          <form onSubmit={handleLogin}>
            <input
              type="password"
              placeholder="パスワード"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="login-input"
            />
            <button type="submit" className="login-button">ログイン</button>
          </form>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <h1>💰 支出明細 <span className="firebase-badge-small">🔥</span></h1>
        <div className="header-actions">
          <button 
            onClick={goToPreviousMonth} 
            className="month-nav-btn"
            disabled={getAvailableMonths().indexOf(selectedMonth) === getAvailableMonths().length - 1}
          >
            ◀
          </button>
          <select 
            value={selectedMonth} 
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="month-selector"
            size="1"
          >
            {getAvailableMonths().map(payrollMonth => {
              const { startDate, endDate } = getPayrollPeriod(payrollMonth);
              const [, sMonth, sDay] = startDate.split('-');
              const [, eMonth, eDay] = endDate.split('-');
              const label = `${payrollMonth} (${sMonth}/${sDay}〜${eMonth}/${eDay})`;
              return <option key={payrollMonth} value={payrollMonth}>{label}</option>;
            })}
          </select>
          <button 
            onClick={goToNextMonth} 
            className="month-nav-btn"
            disabled={getAvailableMonths().indexOf(selectedMonth) === 0}
          >
            ▶
          </button>
          <button onClick={() => setShowSettings(!showSettings)} className="settings-btn">
            ⚙️
          </button>
        </div>
      </header>

      <div className="period-info">
        📅 給料日精算期間: {startDate} 〜 {endDate}
      </div>

      {showSettings && (
        <div className="settings-panel">
          <h3>カテゴリ管理</h3>
          <div className="category-list">
            {categories.map(cat => (
              <div key={cat} className="category-item">
                <span style={{color: CATEGORY_COLORS[cat] || '#666'}}>{cat}</span>
                <button onClick={() => handleDeleteCategory(cat)} className="delete-btn-small">×</button>
              </div>
            ))}
          </div>
          <div className="add-category">
            <input
              type="text"
              placeholder="新しいカテゴリ"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
            />
            <button onClick={handleAddCategory}>追加</button>
          </div>
          <button onClick={() => setShowSettings(false)} className="close-settings">閉じる</button>
        </div>
      )}

      <div className="nav-tabs">
        <button 
          className={currentView === 'list' ? 'active' : ''} 
          onClick={() => setCurrentView('list')}
        >
          📝 リスト
        </button>
        <button 
          className={currentView === 'chart' ? 'active' : ''} 
          onClick={() => setCurrentView('chart')}
        >
          📊 グラフ
        </button>
        <button 
          className={currentView === 'summary' ? 'active' : ''} 
          onClick={() => setCurrentView('summary')}
        >
          💵 精算
        </button>
        <button 
          className={currentView === 'trend' ? 'active' : ''} 
          onClick={() => setCurrentView('trend')}
        >
          📈 推移
        </button>
        <button 
          className={currentView === 'activity' ? 'active' : ''} 
          onClick={() => setCurrentView('activity')}
        >
          🕒 履歴
        </button>
      </div>

      {currentView === 'activity' && (
        <div className="activity-container">
          <h2>アクティビティ履歴</h2>
          {activityLog.length === 0 ? (
            <div className="empty-state">まだ履歴がありません</div>
          ) : (
            <div className="activity-list">
              {activityLog.map(log => (
                <div key={log.id} className="activity-item">
                  <div className="activity-header">
                    <span className={`activity-action action-${log.action}`}>
                      {log.action === '追加' ? '➕' : log.action === '削除' ? '🗑️' : '📥'} {log.action}
                    </span>
                    <span className="activity-time">
                      {new Date(log.timestamp).toLocaleString('ja-JP')}
                    </span>
                  </div>
                  <div className="activity-details">
                    {log.action === 'インポート' ? (
                      <p>
                        {log.details.count}件のデータを{log.details.months}ヶ月分インポート
                      </p>
                    ) : (
                      <>
                        <p>
                          <strong>{log.details.person}</strong> - {log.details.description}
                        </p>
                        <p>
                          ¥{log.details.amount?.toLocaleString()} | {log.details.category} | {log.details.date}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {currentView === 'trend' && (
        <div className="trend-container">
          <h2>月別推移</h2>
          
          <div className="chart-section">
            <h3>総支出の推移</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="total" stroke="#667eea" strokeWidth={2} name="合計" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-section">
            <h3>担当者別推移</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="ひも" stroke="#2196F3" strokeWidth={2} name="ひも" />
                <Line type="monotone" dataKey="あづ" stroke="#E91E63" strokeWidth={2} name="あづ" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-section">
            <h3>カテゴリ別推移</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                {categories.map((cat, index) => (
                  <Line 
                    key={cat} 
                    type="monotone" 
                    dataKey={cat} 
                    stroke={CATEGORY_COLORS[cat] || COLORS[index % COLORS.length]} 
                    strokeWidth={2}
                    name={cat}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {currentView === 'summary' && (
        <div className="summary-container">
          <div className="summary-card">
            <h3>今月の合計</h3>
            <p className="big-amount">¥{stats.total.toLocaleString()}</p>
          </div>
          <div className="summary-grid">
            <div className="summary-card" style={{borderLeft: `4px solid ${PERSON_COLORS['ひも'].border}`}}>
              <h4>ひも</h4>
              <p className="amount">¥{stats.himoTotal.toLocaleString()}</p>
            </div>
            <div className="summary-card" style={{borderLeft: `4px solid ${PERSON_COLORS['あづ'].border}`}}>
              <h4>あづ</h4>
              <p className="amount">¥{stats.azuTotal.toLocaleString()}</p>
            </div>
          </div>
          <div className="summary-card">
            <h3>一人当たり</h3>
            <p className="amount">¥{stats.half.toLocaleString()}</p>
          </div>
          <div className="summary-card">
            <h3>精算額</h3>
            {stats.settlementAmount > 0 ? (
              <p className="settlement">{stats.settlementDirection}: ¥{stats.settlementAmount.toLocaleString()}</p>
            ) : (
              <p className="settlement">精算なし</p>
            )}
          </div>
        </div>
      )}

      {currentView === 'chart' && (
        <div className="chart-container">
          <div className="chart-section">
            <h3>カテゴリ別支出</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats.categoryStats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="amount">
                  {stats.categoryStats.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[entry.name] || COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          
          <div className="chart-section">
            <h3>カテゴリ別割合</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={stats.categoryStats}
                  dataKey="amount"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label
                >
                  {stats.categoryStats.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[entry.name] || COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {currentView === 'list' && (
        <div className="expense-list">
          {getFilteredExpenses().map(expense => {
            const personColor = PERSON_COLORS[expense.person] || { background: '#f5f5f5', border: '#ccc' };
            const categoryColor = CATEGORY_COLORS[expense.category] || '#666';
            
            // 立て替えの場合は実際の負担者を表示
            const isProxy = expense.category === '立て替え';
            const actualPayer = isProxy ? (expense.person === 'ひも' ? 'あづ' : 'ひも') : expense.person;
            const actualPayerColor = PERSON_COLORS[actualPayer] || { background: '#f5f5f5', border: '#ccc' };
            
            return (
              <div 
                key={expense.firebaseId} 
                className="expense-item"
                style={{
                  backgroundColor: personColor.background,
                  borderLeft: `4px solid ${personColor.border}`
                }}
              >
                <div className="expense-header">
                  <span className="expense-date">{expense.date}</span>
                  <button onClick={() => handleDeleteExpense(expense.firebaseId, expense)} className="delete-btn">×</button>
                </div>
                <div className="expense-details">
                  <h3>{expense.description}</h3>
                  <div className="expense-meta">
                    <span 
                      className="expense-person"
                      style={{backgroundColor: personColor.border}}
                    >
                      {expense.person}
                    </span>
                    {isProxy && (
                      <>
                        <span style={{margin: '0 5px', fontSize: '12px'}}>→</span>
                        <span 
                          className="expense-person"
                          style={{backgroundColor: actualPayerColor.border}}
                        >
                          {actualPayer} 負担
                        </span>
                      </>
                    )}
                    <span 
                      className="expense-category"
                      style={{
                        backgroundColor: categoryColor,
                        color: 'white'
                      }}
                    >
                      {expense.category}
                    </span>
                  </div>
                  {expense.memo && <p className="expense-memo">📝 {expense.memo}</p>}
                </div>
                <div className="expense-amount">¥{expense.amount.toLocaleString()}</div>
              </div>
            );
          })}
          {getFilteredExpenses().length === 0 && (
            <div className="empty-state">この期間の支出はまだありません</div>
          )}
        </div>
      )}

      {showAddForm && (
        <div className="modal-overlay" onClick={() => setShowAddForm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>支出を追加</h2>
            <form onSubmit={handleAddExpense}>
              <div className="form-group">
                <label>日付</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({...formData, date: e.target.value})}
                  required
                />
              </div>
              <div className="form-group">
                <label>明細</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  placeholder="例: ラーメン"
                  required
                />
              </div>
              <div className="form-group">
                <label>金額（円）</label>
                <input
                  type="number"
                  value={formData.amount}
                  onChange={(e) => setFormData({...formData, amount: e.target.value})}
                  placeholder="1000"
                  required
                />
              </div>
              <div className="form-group">
                <label>誰の</label>
                <select
                  value={formData.person}
                  onChange={(e) => setFormData({...formData, person: e.target.value})}
                >
                  <option value="ひも">ひも</option>
                  <option value="あづ">あづ</option>
                </select>
              </div>
              <div className="form-group">
                <label>カテゴリ</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({...formData, category: e.target.value})}
                >
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>メモ（任意）</label>
                <input
                  type="text"
                  value={formData.memo}
                  onChange={(e) => setFormData({...formData, memo: e.target.value})}
                  placeholder="メモ"
                />
              </div>
              <div className="form-actions">
                <button type="button" onClick={() => setShowAddForm(false)} className="cancel-btn">
                  キャンセル
                </button>
                <button type="submit" className="submit-btn">
                  追加
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <button className="fab" onClick={() => setShowAddForm(true)}>
        ＋
      </button>
    </div>
  );
}

export default App;
