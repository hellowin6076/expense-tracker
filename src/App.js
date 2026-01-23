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

const KAKEIBO_PASSWORD = 'azuhimo';
const REMITTANCE_PASSWORD = 'gmlahr25';

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
  const [appMode, setAppMode] = useState(''); // 'kakeibo' or 'remittance'
  const [password, setPassword] = useState('');
  const [expenses, setExpenses] = useState([]);
  const [remittances, setRemittances] = useState([]); // 송금 관리
  const [activityLog, setActivityLog] = useState([]);
  const [categories, setCategories] = useState(['食費', '外食', 'デート', '日用品', 'その他❤️', '立て替え']);
  const [remittanceCategories] = useState(['あづ', 'SMBC']); // 송금 카테고리
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null); // 수정 중인 지출
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

  // 송금 관리용 formData
  const [remittanceFormData, setRemittanceFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    category: 'SMBC', // 기본값 SMBC
    memo: '',
    type: 'send' // 'send' (송금) or 'receive' (받음)
  });

  const [newCategory, setNewCategory] = useState('');

  // Firebaseからデータをリアルタイムで取得
  useEffect(() => {
    const expensesRef = ref(database, 'expenses');
    const categoriesRef = ref(database, 'categories');
    const activityLogRef = ref(database, 'activityLog');
    const remittancesRef = ref(database, 'remittances'); // NEW
    
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

    // NEW: 송금 데이터 구독
    const unsubscribeRemittances = onValue(remittancesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const remittancesList = Object.keys(data).map(key => ({
          firebaseId: key,
          ...data[key]
        }));
        setRemittances(remittancesList);
      } else {
        setRemittances([]);
      }
    });

    const savedAuth = sessionStorage.getItem('authenticated');
    const savedMode = sessionStorage.getItem('appMode');
    if (savedAuth) {
      setIsAuthenticated(true);
      setAppMode(savedMode || 'kakeibo');
    }
    
    const today = new Date().toISOString().split('T')[0];
    if (savedMode === 'remittance') {
      // 송금 관리: 달력 기준 (YYYY-MM)
      setSelectedMonth(today.substring(0, 7));
    } else {
      // 가계부: 급여일 정산 기준
      const currentPayrollMonth = getPayrollMonth(today);
      setSelectedMonth(currentPayrollMonth);
    }

    return () => {
      unsubscribeExpenses();
      unsubscribeCategories();
      unsubscribeActivityLog();
      unsubscribeRemittances(); // NEW
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
    const today = new Date().toISOString().split('T')[0];
    
    if (password === KAKEIBO_PASSWORD) {
      setIsAuthenticated(true);
      setAppMode('kakeibo');
      sessionStorage.setItem('authenticated', 'true');
      sessionStorage.setItem('appMode', 'kakeibo');
      setPassword('');
      // 가계부: 급여일 정산 기준
      setSelectedMonth(getPayrollMonth(today));
    } else if (password === REMITTANCE_PASSWORD) {
      setIsAuthenticated(true);
      setAppMode('remittance');
      sessionStorage.setItem('authenticated', 'true');
      sessionStorage.setItem('appMode', 'remittance');
      setPassword('');
      // 송금 관리: 달력 기준
      setSelectedMonth(today.substring(0, 7));
    } else {
      alert('パスワードが正しくありません');
    }
  };

  const handleLogout = () => {
    if (window.confirm('ログアウトしますか？')) {
      setIsAuthenticated(false);
      setAppMode('');
      setShowSettings(false); // 설정 패널 닫기
      sessionStorage.removeItem('authenticated');
      sessionStorage.removeItem('appMode');
    }
  };

  const handleAddExpense = async (e) => {
    e.preventDefault();
    
    if (editingExpense) {
      // 수정 모드
      const expenseRef = ref(database, `expenses/${editingExpense.firebaseId}`);
      const updatedExpense = {
        ...editingExpense,
        ...formData,
        amount: parseFloat(formData.amount),
        id: editingExpense.id // 기존 ID 유지
      };
      
      // firebaseId는 제외하고 저장
      const { firebaseId, ...dataToSave } = updatedExpense;
      await set(expenseRef, dataToSave);
      
      // アクティビティログに記録
      await addActivityLog('編集', {
        person: formData.person,
        description: formData.description,
        amount: formData.amount,
        category: formData.category,
        date: formData.date
      });
      
      setEditingExpense(null);
    } else {
      // 추가 모드
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
    }
    
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
  
  const handleEditExpense = (expense) => {
    setEditingExpense(expense);
    setFormData({
      date: expense.date,
      description: expense.description,
      amount: expense.amount.toString(),
      person: expense.person,
      category: expense.category,
      memo: expense.memo || ''
    });
    setShowAddForm(true);
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
    if (appMode === 'remittance') {
      // 송금 관리: 달력 기준 월 목록
      if (remittances.length === 0) {
        const today = new Date().toISOString().split('T')[0];
        return [today.substring(0, 7)]; // YYYY-MM
      }
      
      const monthSet = new Set();
      remittances.forEach(rem => {
        const month = rem.date.substring(0, 7); // YYYY-MM
        monthSet.add(month);
      });
      
      // 현재 월도 추가
      const today = new Date().toISOString().split('T')[0];
      monthSet.add(today.substring(0, 7));
      
      return Array.from(monthSet).sort((a, b) => b.localeCompare(a));
    }
    
    // 가계부: 급여일 정산 기준
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

  // ==================== 송금 관리 함수들 ====================
  
  // 송금 필터링 (달력 기준 1일~말일)
  const getFilteredRemittances = () => {
    return remittances.filter(rem => {
      // 날짜에서 년-월 추출 (YYYY-MM)
      const remMonth = rem.date.substring(0, 7);
      return remMonth === selectedMonth;
    });
  };

  // 송금 통계
  const getRemittanceStats = () => {
    const filtered = getFilteredRemittances();
    
    const azuTotal = filtered
      .filter(rem => rem.category === 'あづ')
      .reduce((sum, rem) => sum + rem.amount, 0);
    
    const smbcTotal = filtered
      .filter(rem => rem.category === 'SMBC')
      .reduce((sum, rem) => sum + rem.amount, 0);
    
    const totalPositive = filtered
      .filter(rem => rem.amount > 0)
      .reduce((sum, rem) => sum + rem.amount, 0);
    
    const totalNegative = Math.abs(filtered
      .filter(rem => rem.amount < 0)
      .reduce((sum, rem) => sum + rem.amount, 0));
    
    return { azuTotal, smbcTotal, totalPositive, totalNegative };
  };

  // 송금 추가
  const handleAddRemittance = async (e) => {
    e.preventDefault();
    const remittancesRef = ref(database, 'remittances');
    
    const amount = remittanceFormData.type === 'send' 
      ? parseFloat(remittanceFormData.amount) 
      : -parseFloat(remittanceFormData.amount);
    
    // 해당 월의 말일로 자동 설정
    const [year, month] = selectedMonth.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    const dateToSave = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;
    
    const newRemittance = {
      id: Date.now(),
      date: dateToSave,
      amount: amount,
      category: remittanceFormData.category,
      memo: remittanceFormData.memo,
      auto: false
    };
    
    await push(remittancesRef, newRemittance);
    
    setRemittanceFormData({
      date: new Date().toISOString().split('T')[0],
      amount: '',
      category: 'SMBC', // 기본값 SMBC
      memo: '',
      type: 'send'
    });
    setShowAddForm(false);
  };

  // 송금 삭제
  const handleDeleteRemittance = async (firebaseId) => {
    if (window.confirm('削除してもよろしいですか？')) {
      const remittanceRef = ref(database, `remittances/${firebaseId}`);
      await remove(remittanceRef);
    }
  };

  // 가계부 정산액 자동 추가
  const handleAddKakeiboSettlement = async () => {
    const stats = getStats();
    
    // 정산액이 0이면 추가 안함
    if (stats.settlementAmount === 0) {
      alert('精算額がありません');
      return;
    }
    
    const remittancesRef = ref(database, 'remittances');
    
    // 기존 가계부 정산 항목이 있으면 삭제
    const filtered = getFilteredRemittances();
    const existing = filtered.find(r => r.auto === true && r.memo === '家計簿精算');
    if (existing) {
      const existingRef = ref(database, `remittances/${existing.firebaseId}`);
      await remove(existingRef);
    }
    
    // 해당 월의 말일 계산
    const [year, month] = selectedMonth.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    const lastDayOfMonth = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;
    
    // ひも → あづ: 양수, あづ → ひも: 음수
    const amount = stats.settlementDirection === 'ひも → あづ' 
      ? stats.settlementAmount 
      : -stats.settlementAmount;
    
    const newRemittance = {
      id: Date.now(),
      date: lastDayOfMonth, // 해당 월 말일
      amount: amount,
      category: 'あづ',
      memo: '家計簿精算',
      auto: true
    };
    
    await push(remittancesRef, newRemittance);
    alert('家計簿精算を追加しました');
  };

  // 야칭 자동 추가
  const handleAddYachin = async () => {
    const remittancesRef = ref(database, 'remittances');
    
    // 기존 家賃 항목이 있으면 삭제
    const filtered = getFilteredRemittances();
    const existing = filtered.find(r => r.auto === true && r.memo === '家賃');
    if (existing) {
      const existingRef = ref(database, `remittances/${existing.firebaseId}`);
      await remove(existingRef);
    }
    
    // 해당 월의 말일 계산
    const [year, month] = selectedMonth.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    const lastDayOfMonth = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;
    
    const newRemittance = {
      id: Date.now(),
      date: lastDayOfMonth, // 해당 월 말일
      amount: 70000,
      category: 'あづ',
      memo: '家賃',
      auto: true
    };
    
    await push(remittancesRef, newRemittance);
    alert('家賃を追加しました');
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
      {appMode === 'kakeibo' ? (
        // 기존 가계부 화면
        <>{renderKakeiboApp()}</>
      ) : (
        // 송금 관리 화면
        <>{renderRemittanceApp()}</>
      )}
    </div>
  );

  // ==================== 가계부 화면 렌더링 ====================
  function renderKakeiboApp() {
    return (
      <>
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
          <div style={{marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #ddd'}}>
            <button 
              onClick={handleLogout}
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '14px',
                backgroundColor: '#f44336',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer'
              }}
            >
              🚪 ログアウト
            </button>
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
                  borderLeft: `4px solid ${personColor.border}`,
                  cursor: 'pointer'
                }}
                onClick={() => handleEditExpense(expense)}
              >
                <div className="expense-header">
                  <span className="expense-date">{expense.date}</span>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation(); // 부모 클릭 이벤트 방지
                      handleDeleteExpense(expense.firebaseId, expense);
                    }} 
                    className="delete-btn"
                  >
                    ×
                  </button>
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
        <div className="modal-overlay" onClick={() => {
          setShowAddForm(false);
          setEditingExpense(null);
        }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{editingExpense ? '支出を編集' : '支出を追加'}</h2>
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
                <button type="button" onClick={() => {
                  setShowAddForm(false);
                  setEditingExpense(null);
                }} className="cancel-btn">
                  キャンセル
                </button>
                <button type="submit" className="submit-btn">
                  {editingExpense ? '保存' : '追加'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <button className="fab" onClick={() => {
        setEditingExpense(null);
        setShowAddForm(true);
      }}>
        ＋
      </button>
      </>
    );
  }

  // ==================== 송금 관리 화면 렌더링 ====================
  function renderRemittanceApp() {
    const remittanceStats = getRemittanceStats();
    
    return (
      <>
      <header className="header">
        <h1>💸 送金管理 <span className="firebase-badge-small">🔥</span></h1>
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
              return <option key={payrollMonth} value={payrollMonth}>{payrollMonth}</option>;
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

      {/* 설정 패널 (로그아웃만) */}
      {showSettings && (
        <div className="settings-panel">
          <h3>設定</h3>
          <div style={{marginTop: '20px'}}>
            <button 
              onClick={handleLogout}
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '14px',
                backgroundColor: '#f44336',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer'
              }}
            >
              🚪 ログアウト
            </button>
          </div>
          <button onClick={() => setShowSettings(false)} className="close-settings">閉じる</button>
        </div>
      )}

      {/* 탭 네비게이션 */}
      <div className="nav-tabs">
        <button 
          className={currentView === 'list' ? 'active' : ''} 
          onClick={() => setCurrentView('list')}
        >
          📝 リスト
        </button>
        <button 
          className={currentView === 'summary' ? 'active' : ''} 
          onClick={() => setCurrentView('summary')}
        >
          💵 精算
        </button>
        <button 
          className={currentView === 'activity' ? 'active' : ''} 
          onClick={() => setCurrentView('activity')}
        >
          🕒 履歴
        </button>
      </div>

      {/* リスト タブ */}
      {currentView === 'list' && (
        <>
          <div className="expense-list">
            {getFilteredRemittances().map(remittance => {
              const isPositive = remittance.amount > 0;
              const categoryColor = remittance.category === 'あづ' ? '#E91E63' : '#4CAF50';
              const amountColor = isPositive ? '#4CAF50' : '#f44336';
              
              return (
                <div 
                  key={remittance.firebaseId} 
                  className="expense-item"
                  style={{
                    backgroundColor: '#fff',
                    borderLeft: `4px solid ${categoryColor}`
                  }}
                >
                  <div className="expense-header">
                    <button onClick={() => handleDeleteRemittance(remittance.firebaseId)} className="delete-btn">×</button>
                  </div>
                  <div className="expense-details">
                    <h3>
                      {remittance.memo} 
                      {remittance.auto && (
                        <span style={{
                          marginLeft: '8px',
                          fontSize: '12px',
                          padding: '2px 6px',
                          backgroundColor: '#2196F3',
                          color: 'white',
                          borderRadius: '3px'
                        }}>
                          {remittance.memo === '家賃' ? '🏠' : '🔄'}
                        </span>
                      )}
                    </h3>
                    <div className="expense-meta">
                      <span 
                        className="expense-category"
                        style={{
                          backgroundColor: categoryColor,
                          color: 'white'
                        }}
                      >
                        {remittance.category}
                      </span>
                    </div>
                  </div>
                  <div 
                    className="expense-amount"
                    style={{ color: amountColor, fontWeight: 'bold' }}
                  >
                    {isPositive ? '+' : ''}¥{remittance.amount.toLocaleString()}
                  </div>
                </div>
              );
            })}
            {getFilteredRemittances().length === 0 && (
              <div className="empty-state">この期間の送金はまだありません</div>
            )}
          </div>
        </>
      )}

      {/* 精算 タブ */}
      {currentView === 'summary' && (
        <div className="summary-container">
          <div className="summary-card">
            <h3>今月の送金合計</h3>
            <p className="big-amount">¥{remittanceStats.totalPositive.toLocaleString()}</p>
          </div>
          
          {remittanceStats.totalNegative > 0 && (
            <div className="summary-card" style={{borderLeft: '4px solid #f44336'}}>
              <h3>受取合計</h3>
              <p className="amount" style={{color: '#f44336'}}>¥{remittanceStats.totalNegative.toLocaleString()}</p>
            </div>
          )}
          
          <div className="summary-grid">
            <div className="summary-card" style={{borderLeft: '4px solid #4CAF50'}}>
              <h4>SMBC</h4>
              <p className="amount">¥{remittanceStats.smbcTotal.toLocaleString()}</p>
            </div>
            <div className="summary-card" style={{borderLeft: '4px solid #E91E63'}}>
              <h4>あづ</h4>
              <p className="amount">¥{remittanceStats.azuTotal.toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}

      {/* 履歴 タブ */}
      {currentView === 'activity' && (
        <div className="activity-container">
          <h2>送金履歴</h2>
          {remittances.length === 0 ? (
            <div className="empty-state">まだ履歴がありません</div>
          ) : (
            <div className="activity-list">
              {remittances
                .sort((a, b) => b.id - a.id)
                .map(rem => {
                  const isPositive = rem.amount > 0;
                  const actionIcon = isPositive ? '💸' : '💰';
                  const actionColor = isPositive ? '#4CAF50' : '#f44336';
                  const actionText = isPositive ? '送金' : '受取';
                  const remMonth = rem.date ? rem.date.substring(0, 7) : '';
                  
                  return (
                    <div key={rem.firebaseId} className="activity-item">
                      <div className="activity-icon" style={{backgroundColor: actionColor}}>
                        {actionIcon}
                      </div>
                      <div className="activity-details">
                        <div className="activity-action" style={{color: actionColor}}>
                          {actionText}
                          {rem.auto && (
                            <span style={{
                              marginLeft: '8px',
                              fontSize: '11px',
                              padding: '2px 5px',
                              backgroundColor: '#2196F3',
                              color: 'white',
                              borderRadius: '3px'
                            }}>
                              自動
                            </span>
                          )}
                        </div>
                        <div className="activity-time">
                          {remMonth} - {rem.memo}
                        </div>
                        <div className="activity-info">
                          {rem.category} - {isPositive ? '+' : ''}¥{rem.amount.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* 送金追加 モーダル */}
      {showAddForm && (
        <div className="modal-overlay" onClick={() => setShowAddForm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>送金追加</h2>
            
            {/* 자동 추가 버튼들 */}
            <div style={{marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '10px'}}>
              <button 
                type="button"
                onClick={() => {
                  handleAddKakeiboSettlement();
                  setShowAddForm(false);
                }}
                style={{
                  padding: '12px',
                  fontSize: '13px',
                  backgroundColor: '#667eea',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                🔄 家計簿から精算額を追加
              </button>
              <button 
                type="button"
                onClick={() => {
                  handleAddYachin();
                  setShowAddForm(false);
                }}
                style={{
                  padding: '12px',
                  fontSize: '13px',
                  backgroundColor: '#E91E63',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                🏠 家賃を追加 (¥70,000)
              </button>
            </div>

            <div style={{borderTop: '1px solid #ddd', paddingTop: '20px', marginBottom: '10px'}}>
              <h3 style={{fontSize: '14px', color: '#666', marginBottom: '15px'}}>または手動で追加</h3>
            </div>

            <form onSubmit={handleAddRemittance}>
              <div className="form-group">
                <label>金額（円）</label>
                <input
                  type="number"
                  value={remittanceFormData.amount}
                  onChange={(e) => setRemittanceFormData({...remittanceFormData, amount: e.target.value})}
                  placeholder="70000"
                  required
                />
              </div>
              <div className="form-group">
                <label>種類</label>
                <select
                  value={remittanceFormData.type}
                  onChange={(e) => setRemittanceFormData({...remittanceFormData, type: e.target.value})}
                >
                  <option value="send">送金（支払い）</option>
                  <option value="receive">受取（返金）</option>
                </select>
              </div>
              <div className="form-group">
                <label>送金先</label>
                <select
                  value={remittanceFormData.category}
                  onChange={(e) => setRemittanceFormData({...remittanceFormData, category: e.target.value})}
                >
                  {remittanceCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>メモ</label>
                <input
                  type="text"
                  value={remittanceFormData.memo}
                  onChange={(e) => setRemittanceFormData({...remittanceFormData, memo: e.target.value})}
                  placeholder="電気代、ガス代など"
                  required
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
      </>
    );
  }
}

export default App;
